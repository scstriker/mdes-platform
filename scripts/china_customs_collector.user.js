// ==UserScript==
// @name         中国海关医疗器械进出口数据定制导出与原件采集套件 (MDES 202601)
// @namespace    http://stats.customs.gov.cn/
// @version      4.0.0
// @description  基于《医疗器械HS编码最终版_202601_164项.csv》(164项HS8/117项HS6/11大类)：强制 MAX_INFLIGHT=1 单飞低频合规串行获取(>=3.5s随机抖动+批次呼吸冷却)，支持 monthFlag=1 年度按月输出与单自然月双模式、四分组独立原字节归档(product/partner/regime/region)及 browser-harness CDP 桥接。
// @author       MDES Platform
// @match        http://stats.customs.gov.cn/*
// @match        https://stats.customs.gov.cn/*
// @noframes
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
  "use strict";

  const SUITE_VERSION = "4.0.0";
  const DICT_VERSION = "202601";
  const EXPECTED_DICT_SHA256 = "ab8e97496fbc9500877f02adc61ab214788f79234b9cb1f565a98f77a683a59b";
  const PILOT_HS8 = Object.freeze(["90181100"]);
  const DEFAULT_GROUP_SIZE = 20;

  // 低频合规串行硬门限（严禁高并发与高频刷接口）
  const HARD_FLOOR_INTERVAL_MS = 2500;
  const MIN_REQUEST_INTERVAL_MS = 3500;
  const DEFAULT_MAX_INTERVAL_MS = 6500;
  const BATCH_COOLDOWN_EVERY = 8;
  const BATCH_COOLDOWN_MIN_MS = 15000;
  const BATCH_COOLDOWN_MAX_MS = 25000;
  const MAX_SAFE_EXPORT_ROWS = 9000;

  // 官方《医疗器械HS编码最终版_202601_164项.csv》精确字典顺序（164项HS8、117项HS6、11个一级类别）
  const RAW_DICT_TUPLES_202601 = [
    [1, "医用诊断装备", "体重计，包括婴儿秤；家用秤", "84231000", "842310"],
    [2, "医用诊断装备", "心电图记录仪", "90181100", "901811"],
    [3, "医用诊断装备", "B型超声波诊断仪", "90181210", "901812"],
    [4, "医用诊断装备", "彩色超声波诊断仪", "90181291", "901812"],
    [5, "医用诊断装备", "超声波扫描装置", "90181299", "901812"],
    [6, "医用诊断装备", "成套的核磁共振成像装置", "90181310", "901813"],
    [7, "医用诊断装备", "核磁共振成像装置的零件", "90181390", "901813"],
    [8, "医用诊断装备", "闪烁摄影装置", "90181400", "901814"],
    [9, "医用诊断装备", "听力计", "90181941", "901819"],
    [10, "医用诊断装备", "其他听力诊断装置", "90181949", "901819"],
    [11, "医用诊断装备", "电气诊断装置", "90181990", "901819"],
    [12, "医用诊断装备", "听诊器", "90189010", "901890"],
    [13, "医用诊断装备", "血压测量仪器及器具", "90189020", "901890"],
    [14, "医用诊断装备", "内窥镜", "90189030", "901890"],
    [15, "医用诊断装备", "X射线断层检查仪", "90221200", "902212"],
    [16, "医用诊断装备", "其他，牙科用X射线应用设备", "90221300", "902213"],
    [17, "医用诊断装备", "其他，医疗、外科或兽医用X射线应用设备", "90221400", "902214"],
    [18, "医用诊断装备", "X射线管", "90223000", "902230"],
    [19, "医用诊断装备", "X射线影像增强器", "90229010", "902290"],
    [20, "医用诊断装备", "X光发生器等、检查用家具等；9022设备零件", "90229090", "902290"],
    [21, "医用诊断装备", "液体温度计，可直接读数", "90251100", "902511"],
    [22, "医用诊断装备", "温度计及高温计，未与其他仪器组合", "90251990", "902519"],
    [23, "治疗装备", "紫外线及红外线装置", "90182000", "901820"],
    [24, "治疗装备", "牙钻机，可与其他牙科设备组装在同一底座上", "90184100", "901841"],
    [25, "治疗装备", "肾脏透析设备（人工肾）", "90189040", "901890"],
    [26, "治疗装备", "透热疗法设备", "90189050", "901890"],
    [27, "治疗装备", "输血设备", "90189060", "901890"],
    [28, "治疗装备", "手术机器人", "90189080", "901890"],
    [29, "治疗装备", "其他医疗、外科或兽医用仪器及器具", "90189099", "901890"],
    [30, "治疗装备", "医疗、外科、牙科或兽医用α、β、γ射线的应用设备", "90222110", "902221"],
    [31, "治疗装备", "医疗、外科、牙科或兽医用其他离子射线的应用设备", "90222190", "902221"],
    [32, "生命支持装备", "制氧量≥15000立方米/小时的制氧机", "84196011", "841960"],
    [33, "生命支持装备", "其他制氧机", "84196019", "841960"],
    [34, "生命支持装备", "病员监护仪", "90181930", "901819"],
    [35, "生命支持装备", "麻醉设备", "90189070", "901890"],
    [36, "生命支持装备", "有创呼吸机", "90192010", "901920"],
    [37, "生命支持装备", "无创呼吸机", "90192020", "901920"],
    [38, "生命支持装备", "其他臭氧治疗器、氧气治疗器、喷雾治疗器、人工呼吸器或其他治疗用呼吸器具", "90192090", "901920"],
    [39, "急救与应急专用装备", "急救药箱、药包", "30065000", "300650"],
    [40, "急救与应急专用装备", "机动放射线检查车", "87059020", "870590"],
    [41, "急救与应急专用装备", "机动医疗车", "87059040", "870590"],
    [42, "康复医疗装备", "渐紧压袜类", "61151000", "611510"],
    [43, "康复医疗装备", "视力矫正眼镜用变色镜片坯件", "70151010", "701510"],
    [44, "康复医疗装备", "其他视力矫正眼镜用玻璃", "70151090", "701510"],
    [45, "康复医疗装备", "非机械驱动残疾人用车", "87131000", "871310"],
    [46, "康复医疗装备", "其他残疾人用车", "87139000", "871390"],
    [47, "康复医疗装备", "隐形眼镜片", "90013000", "900130"],
    [48, "康复医疗装备", "玻璃制变色镜片", "90014010", "900140"],
    [49, "康复医疗装备", "玻璃制太阳镜片", "90014091", "900140"],
    [50, "康复医疗装备", "其他玻璃制眼镜片", "90014099", "900140"],
    [51, "康复医疗装备", "其他材料制变色镜片", "90015010", "900150"],
    [52, "康复医疗装备", "其他材料制太阳镜片", "90015091", "900150"],
    [53, "康复医疗装备", "其他材料制眼镜片", "90015099", "900150"],
    [54, "康复医疗装备", "塑料制眼镜架", "90031100", "900311"],
    [55, "康复医疗装备", "金属材料制眼镜架", "90031910", "900319"],
    [56, "康复医疗装备", "天然材料制眼镜架", "90031920", "900319"],
    [57, "康复医疗装备", "材料制眼镜架", "90031990", "900319"],
    [58, "康复医疗装备", "眼镜零件", "90039000", "900390"],
    [59, "康复医疗装备", "太阳镜", "90041000", "900410"],
    [60, "康复医疗装备", "变色镜", "90049010", "900490"],
    [61, "康复医疗装备", "矫正视力、护目等用途的眼镜等物品", "90049090", "900490"],
    [62, "康复医疗装备", "按摩器具", "90191010", "901910"],
    [63, "康复医疗装备", "机械疗法器具及心理功能测验装置", "90191090", "901910"],
    [64, "康复医疗装备", "矫形或骨折用器具", "90211000", "902110"],
    [65, "康复医疗装备", "助听器，不包括零件、附件", "90214000", "902140"],
    [66, "康复医疗装备", "残疾人车辆零件、附件", "87142000", "871420"],
    [67, "IVD", "抗血清及其他血份", "30021200", "300212"],
    [68, "IVD", "免疫制品，已配定剂量或制成零售包装", "30021500", "300215"],
    [69, "IVD", "制成的微生物或植物、人体、动物细胞培养基", "38210000", "382100"],
    [70, "IVD", "疟疾用附于衬背上的诊断或实验用试剂", "38221100", "382211"],
    [71, "IVD", "寨卡病毒及由伊蚊属蚊子传播的其他疾病用附于衬背上的诊断或实验用试剂", "38221200", "382212"],
    [72, "IVD", "血型鉴定用附于衬背上的诊断或实验用试剂", "38221300", "382213"],
    [73, "IVD", "其他附于衬背上的诊断或实验用试剂及不论是否附于衬背上的配制试剂", "38221900", "382219"],
    [74, "IVD", "有证标准样品", "38229000", "382290"],
    [75, "IVD", "熔融石英等熔融硅石制实验室、医用玻璃器皿", "70171000", "701710"],
    [76, "IVD", "其他实验室、卫生及配药耐热玻璃器皿", "70172000", "701720"],
    [77, "IVD", "其他实验室、卫生及配药用玻璃器皿", "70179000", "701790"],
    [78, "IVD", "罩的平面最大边长不超过120厘米的气密生物安全柜", "84147010", "841470"],
    [79, "IVD", "利用温度变化处理材料的机器、装置等", "84198990", "841989"],
    [80, "IVD", "离心机，包括离心干燥机", "84211990", "842119"],
    [81, "IVD", "立体显微镜", "90111000", "901110"],
    [82, "IVD", "复式光学显微镜", "90118000", "901180"],
    [83, "IVD", "复式光学显微镜的零件、附件", "90119000", "901190"],
    [84, "IVD", "显微镜（光学显微镜除外）；衍射设备", "90121000", "901210"],
    [85, "IVD", "显微镜（光学显微镜除外）及衍射设备的零件", "90129000", "901290"],
    [86, "IVD", "使用光学射线的分光仪、分光光度计及摄谱仪", "90273000", "902730"],
    [87, "IVD", "基因测序仪", "90275010", "902750"],
    [88, "IVD", "使用光学射线(紫外线、可见光、红外线)的仪器及装置", "90275090", "902750"],
    [89, "IVD", "品目90.27所列的其他仪器及装置", "90278990", "902789"],
    [90, "IVD", "检镜切片机；9027所列仪器及装置的零附件", "90279000", "902790"],
    [91, "植介入器械", "牙科粘固剂及其他牙科填料；骨骼粘固剂", "30064000", "300640"],
    [92, "植介入器械", "宫内节育器", "90189091", "901890"],
    [93, "植介入器械", "假牙", "90212100", "902121"],
    [94, "植介入器械", "牙齿固定件", "90212900", "902129"],
    [95, "植介入器械", "人造关节", "90213100", "902131"],
    [96, "植介入器械", "其他人造的人体部分", "90213900", "902139"],
    [97, "植介入器械", "心脏起搏器，不包括零件、附件", "90215000", "902150"],
    [98, "植介入器械", "血管支架", "90219011", "902190"],
    [99, "植介入器械", "其他人体支架", "90219019", "902190"],
    [100, "植介入器械", "其他为弥补生理缺陷或残疾而穿戴、携带或植入人体内的其他器具", "90219090", "902190"],
    [101, "专科医疗器械", "牙科用熟石膏", "25202010", "252020"],
    [102, "专科医疗器械", "清洁牙缝用纱线（牙线），单独零售包装的", "33062000", "330620"],
    [103, "专科医疗器械", "漱口剂", "33069010", "330690"],
    [104, "专科医疗器械", "其他口腔清洁剂，包括假牙稳固剂及粉", "33069090", "330690"],
    [105, "专科医疗器械", "成套、零售包装或制成片状、马蹄形、条纹及类似形状的牙科用蜡及造型膏", "34070010", "340700"],
    [106, "专科医疗器械", "以熟石膏为基本成分的牙科用其他制品", "34070020", "340700"],
    [107, "专科医疗器械", "其他塑型用膏", "34070090", "340700"],
    [108, "专科医疗器械", "装有牙科设备的牙科用椅", "90184910", "901849"],
    [109, "专科医疗器械", "牙科用仪器及器具", "90184990", "901849"],
    [110, "专科医疗器械", "眼科用其他仪器及器具", "90185000", "901850"],
    [111, "专科医疗器械", "牙科椅和理发用类似椅及其零件", "94021090", "940210"],
    [112, "医用耗材及无源器械", "无菌外科肠线，昆布，止血材料，阻隔材料", "30061000", "300610"],
    [113, "医用耗材及无源器械", "专用于人类或兽药的凝胶制品，作为外科手术或体检时躯体部位的润滑剂，或者作为躯体和医疗器械之间的耦合剂", "30067000", "300670"],
    [114, "医用耗材及无源器械", "可确定用于造口术的用具", "30069100", "300691"],
    [115, "医用耗材及无源器械", "X光用成卷的感光卷片", "37021000", "370210"],
    [116, "医用耗材及无源器械", "未曝光红色或红外激光胶片，宽＞610mm，长＞200m", "37024292", "370242"],
    [117, "医用耗材及无源器械", "冲洗照相胶卷及相片用化学制剂", "37079010", "370790"],
    [118, "医用耗材及无源器械", "硫化橡胶制避孕套", "40141000", "401410"],
    [119, "医用耗材及无源器械", "硫化橡胶制其他卫生及医疗用品", "40149000", "401490"],
    [120, "医用耗材及无源器械", "未漂白轻质平纹布，按重量计含棉量在85%及以上", "52081100", "520811"],
    [121, "医用耗材及无源器械", "漂白的轻质平纹布，按重量计含棉量在85%及以上", "52082100", "520821"],
    [122, "医用耗材及无源器械", "注射器，不论是否装有针头", "90183100", "901831"],
    [123, "医用耗材及无源器械", "管状金属针头", "90183210", "901832"],
    [124, "医用耗材及无源器械", "缝合用针", "90183220", "901832"],
    [125, "医用耗材及无源器械", "其他针、导管、插管及类似品", "90183900", "901839"],
    [126, "医用耗材及无源器械", "供婴儿使用的尿裤及尿布，任何材料制", "96190011", "961900"],
    [127, "医用耗材及无源器械", "其他任何材料制的尿裤及尿布", "96190019", "961900"],
    [128, "医用耗材及无源器械", "任何材料制的卫生巾（护垫）及卫生棉条", "96190020", "961900"],
    [129, "感染防护与医院配套", "橡皮膏", "30051010", "300510"],
    [130, "感染防护与医院配套", "胶粘敷料及其他有胶粘涂层的物品", "30051090", "300510"],
    [131, "感染防护与医院配套", "药棉、纱布、绷带", "30059010", "300590"],
    [132, "感染防护与医院配套", "软填料及类似物品", "30059090", "300590"],
    [133, "感染防护与医院配套", "非零售包装的杀菌剂", "38089290", "380892"],
    [134, "感染防护与医院配套", "消毒剂", "38089400", "380894"],
    [135, "感染防护与医院配套", "聚氯乙烯制手套（分指手套、连指手套等）", "39262011", "392620"],
    [136, "感染防护与医院配套", "其他塑料制手套（分指手套、连指手套等）", "39262019", "392620"],
    [137, "感染防护与医院配套", "硫化橡胶制医疗、外科、牙科或兽医用分指手套、连指手套及露指手套", "40151200", "401512"],
    [138, "感染防护与医院配套", "硫化橡胶制其他分指、连指及露指手套", "40151900", "401519"],
    [139, "感染防护与医院配套", "硫化橡胶制医疗、外科、牙科或兽医用衣着用品及附件(不包括手套)", "40159010", "401590"],
    [140, "感染防护与医院配套", "棉或麻毡呢或无纺织物制服装", "62101020", "621010"],
    [141, "感染防护与医院配套", "化纤毡呢或无纺织物制服装", "62101030", "621010"],
    [142, "感染防护与医院配套", "其他纺织材料毡呢或无纺织物制服装", "62101090", "621010"],
    [143, "感染防护与医院配套", "口罩", "63079010", "630790"],
    [144, "感染防护与医院配套", "第一分章的制成品，包括服装裁剪样", "63079090", "630790"],
    [145, "感染防护与医院配套", "钢铁制卫生器具，包括零件", "73249000", "732490"],
    [146, "感染防护与医院配套", "铜制卫生器具及其零件", "74182000", "741820"],
    [147, "感染防护与医院配套", "铝制卫生器具及其零件", "76152000", "761520"],
    [148, "感染防护与医院配套", "医用或实验室用消毒器具", "84192000", "841920"],
    [149, "感染防护与医院配套", "科研、医疗专用卤钨灯", "85392110", "853921"],
    [150, "感染防护与医院配套", "其他科研医疗专用白炽灯，功率≤200W，额定电压＞100V", "85392210", "853922"],
    [151, "感染防护与医院配套", "科研、医疗专用白炽灯泡", "85392910", "853929"],
    [152, "感染防护与医院配套", "科研、医疗专用热阴极荧光灯", "85393110", "853931"],
    [153, "感染防护与医院配套", "其他金属卤化物灯", "85393290", "853932"],
    [154, "感染防护与医院配套", "其他科研、医疗专用放电灯管", "85393910", "853939"],
    [155, "感染防护与医院配套", "其他呼吸器具及防毒面具", "90200000", "902000"],
    [156, "感染防护与医院配套", "其他医用家具及其零件", "94029000", "940290"],
    [157, "感染防护与医院配套", "纸浆、纸等制的其他家庭、卫生或医院用品", "48189000", "481890"],
    [158, "其他", "腺体、其他器官及其分泌物的提取物", "30012000", "300120"],
    [159, "其他", "肝素及其盐", "30019010", "300190"],
    [160, "其他", "供防治病用的人体或动物制品；已干燥的腺体及其他器官，不论是否制成粉末", "30019090", "300190"],
    [161, "其他", "X光检查造影剂；用于病人的诊断试剂", "30063000", "300630"],
    [162, "其他", "X射线的应用设备", "90221990", "902219"],
    [163, "其他", "其他α、β、γ射线或其他离子射线的应用设备", "90222990", "902229"],
    [164, "其他", "明胶制装药用胶囊", "96020010", "960200"]
  ];

  const HS_DICT_202601 = Object.freeze(
    RAW_DICT_TUPLES_202601.map(([seq, category, name, hs8, hs6]) =>
      Object.freeze({ seq, category, name, hs8, hs6 })
    )
  );

  const HS_DICT_BY_HS8 = new Map(HS_DICT_202601.map((item) => [item.hs8, item]));

  const CATEGORIES_202601 = (() => {
    const map = new Map();
    for (const item of HS_DICT_202601) {
      if (!map.has(item.category)) map.set(item.category, []);
      map.get(item.category).push(item.hs8);
    }
    return Object.freeze(
      Array.from(map.entries()).map(([category, hs8]) =>
        Object.freeze({ category, count: hs8.length, hs8: Object.freeze(hs8) })
      )
    );
  })();

  function buildDeterministicBatchGroups(entries = HS_DICT_202601, groupSize = DEFAULT_GROUP_SIZE) {
    const groups = [];
    for (let offset = 0; offset < entries.length; offset += groupSize) {
      const slice = entries.slice(offset, offset + groupSize);
      const groupIndex = Math.floor(offset / groupSize) + 1;
      const groupId = `G${String(groupIndex).padStart(2, "0")}`;
      const startSeq = slice[0].seq;
      const endSeq = slice[slice.length - 1].seq;
      groups.push(
        Object.freeze({
          groupId,
          startSeq,
          endSeq,
          count: slice.length,
          hs8: Object.freeze(slice.map((item) => item.hs8)),
          label: `${groupId} 固定编码组 (序号 ${String(startSeq).padStart(3, "0")}–${String(endSeq).padStart(3, "0")}, ${slice.length}项)`
        })
      );
    }
    return Object.freeze(groups);
  }

  const BATCH_GROUPS_202601 = buildDeterministicBatchGroups(HS_DICT_202601, DEFAULT_GROUP_SIZE);

  const FLOW_SPECS = Object.freeze({
    import: Object.freeze({ key: "import", label: "进口 (Import)", iEType: "1" }),
    export: Object.freeze({ key: "export", label: "出口 (Export)", iEType: "0" })
  });

  const GROUPING_SPECS = Object.freeze({
    product: Object.freeze({
      key: "product",
      label: "商品全国合计 (product)",
      outerFields: ["CODE_TS"]
    }),
    partner: Object.freeze({
      key: "partner",
      label: "贸易伙伴构成 (partner)",
      outerFields: ["CODE_TS", "ORIGIN_COUNTRY"]
    }),
    regime: Object.freeze({
      key: "regime",
      label: "贸易方式构成 (regime)",
      outerFields: ["CODE_TS", "TRADE_MODE"]
    }),
    region: Object.freeze({
      key: "region",
      label: "收发货人注册地·31省市关区 (region)",
      outerFields: ["CODE_TS", "TRADE_CO_PORT"]
    })
  });

  const ORDERED_FLOWS = Object.freeze(["import", "export"]);
  const ORDERED_GROUPINGS = Object.freeze(["product", "partner", "regime", "region"]);

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function validateDelayConfig(minMs = MIN_REQUEST_INTERVAL_MS, maxMs = DEFAULT_MAX_INTERVAL_MS) {
    if (
      typeof minMs !== "number" ||
      typeof maxMs !== "number" ||
      !Number.isFinite(minMs) ||
      !Number.isFinite(maxMs) ||
      minMs < HARD_FLOOR_INTERVAL_MS ||
      maxMs < minMs
    ) {
      throw new Error(
        `LOW_FREQUENCY_VIOLATION: 请求间隔必须满足 minMs >= ${HARD_FLOOR_INTERVAL_MS} 且 maxMs >= minMs (收到 ${minMs}..${maxMs})`
      );
    }
  }

  function randomJitterMs(minMs = MIN_REQUEST_INTERVAL_MS, maxMs = DEFAULT_MAX_INTERVAL_MS) {
    validateDelayConfig(minMs, maxMs);
    if (maxMs === minMs) return minMs;
    return Math.round(minMs + Math.random() * (maxMs - minMs));
  }

  /**
   * 全局单飞串行互斥锁（MAX_INFLIGHT === 1）：
   * 严禁任何并发请求同时打向海关统计在线查询平台。
   */
  const serialFlightState = {
    inFlight: false,
    lastCompletedAt: 0,
    completedRequestsInRun: 0
  };

  async function withSerialFlightLock(opts, fn) {
    if (serialFlightState.inFlight) {
      throw new Error(
        "ERR_CONCURRENT_REQUEST_FORBIDDEN: 严禁并发请求海关接口 (MAX_INFLIGHT=1 单飞互斥锁已拦截重入调用)"
      );
    }
    const minMs = opts?.minDelayMs ?? MIN_REQUEST_INTERVAL_MS;
    const maxMs = opts?.maxDelayMs ?? DEFAULT_MAX_INTERVAL_MS;
    validateDelayConfig(minMs, maxMs);

    serialFlightState.inFlight = true;
    try {
      if (!opts?.skipPoliteWaitForUnitTest && serialFlightState.lastCompletedAt > 0) {
        const targetGap = randomJitterMs(minMs, maxMs);
        const elapsed = Date.now() - serialFlightState.lastCompletedAt;
        if (elapsed < targetGap) {
          await sleep(targetGap - elapsed);
        }
      }
      return await fn();
    } finally {
      serialFlightState.lastCompletedAt = Date.now();
      serialFlightState.completedRequestsInRun += 1;
      serialFlightState.inFlight = false;
    }
  }

  function reconstructOfficialDictCsvBytes() {
    const csvText =
      "\uFEFF序号,一级类别,名称,HS海关编码,HS联合国编码\n" +
      HS_DICT_202601.map((r) => `${r.seq},${r.category},${r.name},${r.hs8},${r.hs6}`).join("\n") +
      "\n";
    return new TextEncoder().encode(csvText);
  }

  const SHA256_K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ]);

  function pureJsSha256Hex(view) {
    const len = view.byteLength;
    const bitHi = Math.floor((len * 8) / 0x100000000);
    const bitLo = (len * 8) >>> 0;
    const padLen = ((len + 9 + 63) & ~63);
    const padded = new Uint8Array(padLen);
    padded.set(view);
    padded[len] = 0x80;
    const dv = new DataView(padded.buffer);
    dv.setUint32(padLen - 8, bitHi, false);
    dv.setUint32(padLen - 4, bitLo, false);

    let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
    let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
    const w = new Uint32Array(64);
    const rotr = (x, n) => (x >>> n) | (x << (32 - n));

    for (let off = 0; off < padLen; off += 64) {
      for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4, false);
      for (let i = 16; i < 64; i++) {
        const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
        const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
      }
      let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
      for (let i = 0; i < 64; i++) {
        const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        const ch = (e & f) ^ (~e & g);
        const temp1 = (h + S1 + ch + SHA256_K[i] + w[i]) >>> 0;
        const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        const maj = (a & b) ^ (a & c) ^ (b & c);
        const temp2 = (S0 + maj) >>> 0;
        h = g; g = f; f = e; e = (d + temp1) >>> 0;
        d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
      }
      h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
      h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
    }
    return [h0, h1, h2, h3, h4, h5, h6, h7].map((x) => x.toString(16).padStart(8, "0")).join("");
  }

  async function computeSha256Hex(rawBufferOrBytes) {
    const view =
      rawBufferOrBytes instanceof Uint8Array
        ? rawBufferOrBytes
        : new Uint8Array(rawBufferOrBytes);
    if (typeof crypto !== "undefined" && crypto && crypto.subtle && typeof crypto.subtle.digest === "function") {
      const copy = new Uint8Array(view.byteLength);
      copy.set(view);
      const digest = await crypto.subtle.digest("SHA-256", copy);
      return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    }
    // http://stats.customs.gov.cn 为非 HTTPS 上下文，浏览器不暴露 crypto.subtle，回退至纯 JS FIPS 180-4 SHA-256
    return pureJsSha256Hex(view);
  }

  function bytesToBase64(bytes) {
    const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const CHUNK = 0x8000;
    const parts = [];
    for (let i = 0; i < view.length; i += CHUNK) {
      const sub = view.subarray(i, i + CHUNK);
      let bin = "";
      for (let j = 0; j < sub.length; j++) {
        bin += String.fromCharCode(sub[j]);
      }
      parts.push(bin);
    }
    return btoa(parts.join(""));
  }

  async function verifyEmbeddedDictionary() {
    const bytes = reconstructOfficialDictCsvBytes();
    const sha256 = await computeSha256Hex(bytes);
    const hs8Set = new Set(HS_DICT_202601.map((r) => r.hs8));
    const hs6Set = new Set(HS_DICT_202601.map((r) => r.hs6));
    if (sha256 !== EXPECTED_DICT_SHA256) {
      throw new Error(`内置字典 SHA-256 校验失败: 实际 ${sha256}, 预期 ${EXPECTED_DICT_SHA256}`);
    }
    if (hs8Set.size !== 164 || hs6Set.size !== 117 || CATEGORIES_202601.length !== 11) {
      throw new Error(
        `内置字典统计量异常: hs8=${hs8Set.size}, hs6=${hs6Set.size}, categories=${CATEGORIES_202601.length}`
      );
    }
    return {
      dictVersion: DICT_VERSION,
      sha256,
      hs8Count: hs8Set.size,
      hs6Count: hs6Set.size,
      categoryCount: CATEGORIES_202601.length
    };
  }

  function parseSingleNaturalMonth(monthStr) {
    if (typeof monthStr !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(monthStr)) {
      throw new Error(`月份格式必须为单自然月 YYYY-MM，收到: ${String(monthStr)}`);
    }
    const [yearText, monthText] = monthStr.split("-");
    const year = Number(yearText);
    const monthNum = Number(monthText);
    return { month: monthStr, year, startMonth: monthNum, endMonth: monthNum };
  }

  function expandSingleNaturalMonths(startMonthStr, endMonthStr) {
    const start = parseSingleNaturalMonth(startMonthStr);
    const end = parseSingleNaturalMonth(endMonthStr || startMonthStr);
    const startTotal = start.year * 12 + (start.startMonth - 1);
    const endTotal = end.year * 12 + (end.endMonth - 1);
    if (endTotal < startTotal) {
      throw new Error(`截止月份 ${end.month} 不能早于起始月份 ${start.month}`);
    }
    const months = [];
    for (let cur = startTotal; cur <= endTotal; cur++) {
      const y = Math.floor(cur / 12);
      const m = (cur % 12) + 1;
      months.push(`${y}-${String(m).padStart(2, "0")}`);
    }
    return months;
  }

  function validateHs8Batch(hs8List) {
    if (!Array.isArray(hs8List) || hs8List.length === 0) {
      throw new Error("hs8 列表不能为空");
    }
    const seen = new Set();
    const normalized = [];
    for (const raw of hs8List) {
      const code = String(raw ?? "").trim();
      if (!/^\d{8}$/.test(code)) {
        throw new Error(`商品编码必须为 8 位数字字符串: ${code}`);
      }
      if (!HS_DICT_BY_HS8.has(code)) {
        throw new Error(`商品编码不在 ${DICT_VERSION} 正式字典(164项)范围内: ${code}`);
      }
      if (!seen.has(code)) {
        seen.add(code);
        normalized.push(code);
      }
    }
    return normalized;
  }

  function readPortalTimeAnchors() {
    let startAnchor = "202504";
    let endAnchor = "202610";
    try {
      if (typeof document !== "undefined" && document) {
        const ifr = document.querySelector("iframe");
        const docs = [];
        if (ifr && ifr.contentDocument) docs.push(ifr.contentDocument);
        docs.push(document);
        for (const doc of docs) {
          const sEl = doc && typeof doc.getElementById === "function" ? doc.getElementById("currentStartTime") : null;
          if (sEl && /^\d{6}$/.test(String(sEl.value || "").trim())) {
            startAnchor = String(sEl.value).trim();
            break;
          }
        }
        for (const doc of docs) {
          const eEl = doc && typeof doc.getElementById === "function" ? doc.getElementById("currentEndTime") : null;
          if (eEl && /^\d{6}$/.test(String(eEl.value || "").trim())) {
            endAnchor = String(eEl.value).trim();
            break;
          }
        }
      }
    } catch (_) {}
    return { currentStartTime: startAnchor, currentEndTime: endAnchor };
  }

  function parseLatestPublishedYm(rawEndAnchor) {
    const cleaned = String(rawEndAnchor ?? "").trim().replace("-", "");
    if (!/^\d{6}$/.test(cleaned)) return null;
    const maxYear = Number(cleaned.slice(0, 4));
    const maxMonth = Number(cleaned.slice(4, 6));
    if (!Number.isInteger(maxYear) || !Number.isInteger(maxMonth) || maxMonth < 1 || maxMonth > 12) {
      return null;
    }
    return {
      ym: cleaned,
      monthStr: `${maxYear}-${String(maxMonth).padStart(2, "0")}`,
      maxYear,
      maxMonth
    };
  }

  function clampWindowToLatestPublishedMonth({ year, startMonth, endMonth, currentEndTime = null }) {
    const yr = Number(year);
    const sm = Number(startMonth);
    const em = Number(endMonth);
    if (
      !Number.isInteger(yr) ||
      yr < 2000 ||
      yr > 2100 ||
      !Number.isInteger(sm) ||
      !Number.isInteger(em) ||
      sm < 1 ||
      em > 12 ||
      sm > em
    ) {
      return {
        valid: false,
        reason: "invalid_month_window",
        year: yr,
        startMonth: sm,
        endMonth: em,
        clamped: false,
        skipped: true,
        latestPublishedYm: null,
        latestPublishedMonth: null
      };
    }
    const anchor = currentEndTime || readPortalTimeAnchors().currentEndTime;
    const latest = parseLatestPublishedYm(anchor);
    if (!latest) {
      return {
        valid: true,
        reason: null,
        year: yr,
        startMonth: sm,
        endMonth: em,
        clamped: false,
        skipped: false,
        latestPublishedYm: null,
        latestPublishedMonth: null
      };
    }
    if (yr > latest.maxYear || (yr === latest.maxYear && sm > latest.maxMonth)) {
      return {
        valid: true,
        reason: "window_after_latest_published_month",
        year: yr,
        startMonth: sm,
        endMonth: 0,
        clamped: true,
        skipped: true,
        latestPublishedYm: latest.ym,
        latestPublishedMonth: latest.monthStr
      };
    }
    const maxAllowedEnd = yr === latest.maxYear ? latest.maxMonth : 12;
    const effectiveEnd = Math.min(em, maxAllowedEnd);
    return {
      valid: true,
      reason: effectiveEnd < em ? "end_month_clamped_to_latest_published" : null,
      year: yr,
      startMonth: sm,
      endMonth: effectiveEnd,
      clamped: effectiveEnd < em,
      skipped: false,
      latestPublishedYm: latest.ym,
      latestPublishedMonth: latest.monthStr
    };
  }

  function getQueryFrameFetch() {
    try {
      if (typeof document !== "undefined" && document) {
        const ifr = document.querySelector("iframe");
        if (ifr && ifr.contentWindow && typeof ifr.contentWindow.fetch === "function") {
          return ifr.contentWindow.fetch.bind(ifr.contentWindow);
        }
      }
    } catch (_) {}
    return fetch;
  }

  function computeOfficialSelectTableState(year, startMonth, endMonth, currentStartTime = "202504", currentEndTime = "202610") {
    const selectStartTime = `${year}${String(startMonth).padStart(2, "0")}`;
    const selectEndTime = `${year}${String(endMonth).padStart(2, "0")}`;
    if (selectStartTime >= currentStartTime && currentEndTime >= selectEndTime) return 1;
    if (currentStartTime > selectEndTime) return 2;
    return 3;
  }

  function defaultStateCandidatesForYear(year, startMonth = 1, endMonth = 12) {
    const { currentStartTime, currentEndTime } = readPortalTimeAnchors();
    const primary = computeOfficialSelectTableState(year, startMonth, endMonth, currentStartTime, currentEndTime);
    return [primary, ...[1, 2, 3].filter((x) => x !== primary)];
  }

  /**
   * 构造同自然年内按月分列输出（monthFlag="1"）或单月累计（monthFlag=""）参数
   */
  function buildAnnualMonthlyParams({
    year,
    startMonth = 1,
    endMonth = 12,
    monthFlag = "1",
    flow,
    grouping,
    hs8,
    currency = "usd",
    selectTableState = null,
    currentStartTime = null,
    forListCheck = false
  }) {
    const anchors = readPortalTimeAnchors();
    const effCurrentStartTime = currentStartTime || anchors.currentStartTime;
    const effState =
      selectTableState !== null && selectTableState !== undefined
        ? selectTableState
        : computeOfficialSelectTableState(year, startMonth, endMonth, effCurrentStartTime, anchors.currentEndTime);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      throw new Error(`非法统计年份: ${String(year)}`);
    }
    if (
      !Number.isInteger(startMonth) ||
      !Number.isInteger(endMonth) ||
      startMonth < 1 ||
      endMonth > 12 ||
      startMonth > endMonth
    ) {
      throw new Error(`起止月份必须在同一自然年 1..12 内且 startMonth <= endMonth: ${startMonth}..${endMonth}`);
    }
    const flowSpec = FLOW_SPECS[flow];
    if (!flowSpec) {
      throw new Error(`非法流向: ${String(flow)}，仅允许 import 或 export`);
    }
    const groupSpec = GROUPING_SPECS[grouping];
    if (!groupSpec) {
      throw new Error(`非法分组: ${String(grouping)}，仅允许 product/partner/regime/region`);
    }
    const normCurrency = String(currency || "usd").toLowerCase();
    if (normCurrency !== "usd" && normCurrency !== "rmb") {
      throw new Error(`非法币制: ${String(currency)}`);
    }
    const validHs8 = validateHs8Batch(hs8);

    const entries = [
      ["pageSize", "10"],
      ...(forListCheck ? [["pageNum", "1"]] : []),
      ["iEType", flowSpec.iEType],
      ["currencyType", normCurrency],
      ["year", String(year)],
      ["startMonth", String(startMonth)],
      ["endMonth", String(endMonth)],
      ["monthFlag", monthFlag === "1" ? "1" : ""],
      ["unitFlag", "true"],
      ["unitFlag1", "true"],
      ["codeLength", "8"],
      ["outerField1", groupSpec.outerFields[0]],
      ["outerField2", groupSpec.outerFields.length > 1 ? groupSpec.outerFields[1] : ""],
      ["outerField3", ""],
      ["outerField4", ""],
      ["outerValue1", validHs8.join(",")],
      ["outerValue2", ""],
      ["outerValue3", ""],
      ["outerValue4", ""],
      ["orderType", "CODE ASC DEFAULT"],
      ["selectTableState", String(effState)],
      ["currentStartTime", String(effCurrentStartTime)]
    ];

    return new URLSearchParams(entries);
  }

  function buildCustomsQueryParams({
    month,
    flow,
    grouping,
    hs8,
    selectTableState = 3,
    currentStartTime = "202408",
    forListCheck = false
  }) {
    const { year, startMonth, endMonth } = parseSingleNaturalMonth(month);
    return buildAnnualMonthlyParams({
      year,
      startMonth,
      endMonth,
      monthFlag: "",
      flow,
      grouping,
      hs8,
      currency: "usd",
      selectTableState,
      currentStartTime,
      forListCheck
    });
  }

  function buildManifest({ month, months, flow, grouping, hs8, emptyHs8 = [], probeVerifiedZero = false }) {
    let normalizedMonths = [];
    if (Array.isArray(months) && months.length > 0) {
      const seenMonths = new Set();
      for (const m of months) {
        parseSingleNaturalMonth(m);
        if (!seenMonths.has(m)) {
          seenMonths.add(m);
          normalizedMonths.push(m);
        }
      }
      normalizedMonths.sort();
    } else {
      parseSingleNaturalMonth(month);
      normalizedMonths = [month];
    }
    const primaryMonth = month ? (parseSingleNaturalMonth(month), month) : normalizedMonths[0];
    if (!FLOW_SPECS[flow]) throw new Error(`非法流向: ${String(flow)}`);
    if (!GROUPING_SPECS[grouping]) throw new Error(`非法分组: ${String(grouping)}`);
    const validHs8 = validateHs8Batch(hs8);
    const hs8Set = new Set(validHs8);
    const validEmpty = [];
    for (const code of emptyHs8) {
      const normalized = String(code ?? "").trim();
      if (!hs8Set.has(normalized)) {
        throw new Error(`emptyHs8 编码 ${normalized} 必须是 hs8 的子集`);
      }
      if (!validEmpty.includes(normalized)) validEmpty.push(normalized);
    }
    const out = {
      dictVersion: DICT_VERSION,
      month: primaryMonth,
      ...(Array.isArray(months) && months.length > 0 ? { months: normalizedMonths } : {}),
      flow,
      currency: "USD",
      grouping,
      hs8: validHs8,
      emptyHs8: validEmpty
    };
    if (probeVerifiedZero === true) {
      out.probeVerifiedZero = true;
    }
    return out;
  }

  function parseCsvRecordsReadOnly(text) {
    const records = [];
    let record = [];
    let field = "";
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQuotes) {
        if (ch === '"') {
          if (text[i + 1] === '"') {
            field += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          field += ch;
        }
        continue;
      }
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        record.push(field);
        field = "";
      } else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && text[i + 1] === "\n") i++;
        record.push(field);
        records.push(record);
        record = [];
        field = "";
      } else {
        field += ch;
      }
    }
    if (field !== "" || record.length > 0) {
      record.push(field);
      records.push(record);
    }
    return records;
  }

  function decodePreviewReadOnly(rawBytes) {
    const view = rawBytes instanceof Uint8Array ? rawBytes : new Uint8Array(rawBytes);
    if (view.length >= 3 && view[0] === 0xef && view[1] === 0xbb && view[2] === 0xbf) {
      return {
        decoderName: "utf-8-bom (read-only)",
        text: new TextDecoder("utf-8", { fatal: false }).decode(view).replace(/^\uFEFF/, "")
      };
    }
    try {
      return {
        decoderName: "utf-8 (read-only)",
        text: new TextDecoder("utf-8", { fatal: true }).decode(view)
      };
    } catch (_) {
      return {
        decoderName: "gb18030 (read-only)",
        text: new TextDecoder("gb18030", { fatal: false }).decode(view)
      };
    }
  }

  function isHtmlErrorResponse(previewText) {
    const head = previewText.slice(0, 1024).trimStart().toLowerCase();
    return (
      head.startsWith("<!doctype") ||
      head.startsWith("<html") ||
      head.includes("<!doctype html") ||
      head.includes("<html") ||
      head.includes("<head>") ||
      head.includes("<body")
    );
  }

  function extractNormalizedHs8Cell(rawCell) {
    const cleaned = String(rawCell ?? "")
      .trim()
      .replace(/^="(\d+)"$/, "$1")
      .replace(/^'(\d+)$/, "$1")
      .trim();
    return /^\d{8}$/.test(cleaned) ? cleaned : null;
  }

  function parseUsdMicrosReadOnly(rawCell) {
    const cleaned = String(rawCell ?? "")
      .replace(/,/g, "")
      .trim();
    if (!cleaned || !/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
    const neg = cleaned.startsWith("-");
    const unsigned = neg ? cleaned.slice(1) : cleaned;
    const [intPart, fracPart = ""] = unsigned.split(".");
    const paddedFrac = (fracPart + "000000").slice(0, 6);
    const micros = BigInt(intPart) * 1000000n + BigInt(paddedFrac);
    return neg ? -micros : micros;
  }

  function formatUsdMicros(micros) {
    const neg = micros < 0n ? "-" : "";
    const abs = micros < 0n ? -micros : micros;
    const intPart = abs / 1000000n;
    const fracPart = abs % 1000000n;
    if (fracPart === 0n) return `${neg}${intPart.toString()}`;
    const fracStr = fracPart.toString().padStart(6, "0").replace(/0+$/, "");
    return `${neg}${intPart.toString()}.${fracStr}`;
  }

  function inspectRawCustomsBytes(rawBufferOrBytes, requestedHs8 = []) {
    const view =
      rawBufferOrBytes instanceof Uint8Array
        ? rawBufferOrBytes
        : new Uint8Array(rawBufferOrBytes);

    if (view.byteLength === 0) {
      return { ok: false, reason: "empty_response_bytes", byteLength: 0 };
    }

    const { decoderName, text } = decodePreviewReadOnly(view);
    if (isHtmlErrorResponse(text)) {
      return {
        ok: false,
        reason: "html_error_page",
        circuitBreakRequired: true,
        decoderName,
        byteLength: view.byteLength,
        snippet: text.slice(0, 180).replace(/\s+/g, " ")
      };
    }

    const records = parseCsvRecordsReadOnly(text.replace(/^\uFEFF/, ""));
    const nonBlank = records.filter((r) => r.some((cell) => cell.trim() !== ""));
    if (nonBlank.length === 0) {
      return { ok: false, reason: "blank_payload", decoderName, byteLength: view.byteLength };
    }

    const headerColumns = nonBlank[0].map((h) => h.trim());
    const periodColIndex = headerColumns.findIndex((h) =>
      ["数据年月", "统计年月", "年月", "period", "month"].includes(h)
    );
    const hsColIndex = headerColumns.findIndex((h) =>
      ["商品编码", "商品代码", "商品税号", "HS海关编码", "HS编码", "CODE_TS"].includes(h)
    );
    const usdColIndex = headerColumns.findIndex(
      (h) => h === "美元" || h.includes("美元") || h.toUpperCase() === "USD"
    );
    const hasRmbOnly =
      usdColIndex < 0 && headerColumns.some((h) => h.includes("人民币") || h.toUpperCase() === "RMB");

    if (hasRmbOnly) {
      return {
        ok: false,
        reason: "rmb_currency_detected",
        decoderName,
        byteLength: view.byteLength,
        headerColumns
      };
    }

    if (hsColIndex < 0 || usdColIndex < 0) {
      return {
        ok: false,
        reason: "unrecognized_csv_headers",
        decoderName,
        byteLength: view.byteLength,
        headerColumns
      };
    }

    const secondaryLabelIndices = headerColumns
      .map((h, idx) => ({ h, idx }))
      .filter(
        ({ h, idx }) =>
          idx !== hsColIndex &&
          (h.includes("伙伴") || h.includes("方式") || h.includes("注册地") || h.includes("国"))
      )
      .map(({ idx }) => idx);

    const returnedSet = new Set();
    const observedMonths = new Set();
    let detailRowCount = 0;
    let summaryRowCount = 0;
    let usdMicrosTotal = 0n;
    let summaryUsdMicrosTotal = 0n;
    let summaryUsdNonZero = false;

    const recordSummaryRow = (rowCells) => {
      summaryRowCount++;
      const rawSummaryUsd = String(rowCells[usdColIndex] ?? "").trim();
      if (!rawSummaryUsd) return;
      const summaryMicros = parseUsdMicrosReadOnly(rawSummaryUsd);
      if (summaryMicros === null) {
        summaryUsdNonZero = true;
      } else {
        summaryUsdMicrosTotal += summaryMicros;
        if (summaryMicros !== 0n) summaryUsdNonZero = true;
      }
    };

    for (let rIdx = 1; rIdx < nonBlank.length; rIdx++) {
      const row = nonBlank[rIdx];
      const hs8 = extractNormalizedHs8Cell(row[hsColIndex]);
      if (!hs8) {
        recordSummaryRow(row);
        continue;
      }
      const isSecondaryTotal = secondaryLabelIndices.some((cIdx) => {
        const val = String(row[cIdx] ?? "").trim();
        return val === "合计" || val === "总计" || val === "全国合计";
      });
      if (isSecondaryTotal) {
        recordSummaryRow(row);
        continue;
      }
      if (periodColIndex >= 0) {
        const rawP = String(row[periodColIndex] ?? "").trim();
        if (/^\d{6}$/.test(rawP)) {
          observedMonths.add(`${rawP.slice(0, 4)}-${rawP.slice(4, 6)}`);
        } else if (/^\d{4}-\d{2}$/.test(rawP)) {
          observedMonths.add(rawP);
        }
      }
      detailRowCount++;
      returnedSet.add(hs8);
      const micros = parseUsdMicrosReadOnly(row[usdColIndex]);
      if (micros !== null) {
        usdMicrosTotal += micros;
      }
    }

    if (detailRowCount === 0 && summaryUsdNonZero) {
      return {
        ok: false,
        reason: "summary_nonzero_without_detail_rows",
        decoderName,
        byteLength: view.byteLength,
        headerColumns,
        detailRowCount: 0,
        summaryRowCount,
        summaryUsdSum: formatUsdMicros(summaryUsdMicrosTotal)
      };
    }

    const requestedValid = requestedHs8.map((c) => String(c).trim());
    const returnedHs8 = requestedValid.filter((c) => returnedSet.has(c));
    const unexpectedHs8 = Array.from(returnedSet).filter((c) => !requestedValid.includes(c));
    const unreturnedHs8 = requestedValid.filter((c) => !returnedSet.has(c));

    return {
      ok: true,
      decoderName,
      byteLength: view.byteLength,
      headerColumns,
      hasMonthColumn: periodColIndex >= 0,
      observedMonths: Array.from(observedMonths).sort(),
      detailRowCount,
      summaryRowCount,
      returnedHs8,
      unreturnedHs8,
      unexpectedHs8,
      usdDetailSum: formatUsdMicros(usdMicrosTotal),
      usdMicrosTotal
    };
  }

  function extractTotalFromListResponseText(text) {
    const trimmed = text.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith("{")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (typeof parsed?.total === "number") return parsed.total;
        if (typeof parsed?.data?.total === "number") return parsed.data.total;
        if (Array.isArray(parsed?.rows)) return parsed.rows.length;
      } catch (_) {}
    }
    // 优先提取官方结果页隐藏域：<input type="hidden" id="totalSize" name="totalSize" value="1">
    const hiddenTotalMatch = /id=["']totalSize["'][^>]*value=["'](\d+)["']/i.exec(trimmed) || /value=["'](\d+)["'][^>]*id=["']totalSize["']/i.exec(trimmed);
    if (hiddenTotalMatch && hiddenTotalMatch[1]) {
      const hn = Number(hiddenTotalMatch[1]);
      if (Number.isFinite(hn)) return hn;
    }
    // 海关列表接口 HTML 片段模式：<p class="c-666">共查询到 <span>1,234</span> 条数据</p>
    const spanMatch = /class=["'][^"']*c-666[^"']*["'][^>]*>[\s\S]*?<span[^>]*>([\d,]+)<\/span>/i.exec(trimmed);
    if (spanMatch && spanMatch[1]) {
      const n = Number(spanMatch[1].replace(/,/g, ""));
      if (Number.isFinite(n)) return n;
    }
    if (trimmed.includes("暂无数据") || trimmed.includes("没有找到匹配的记录") || trimmed.includes("共查询到0条")) {
      return 0;
    }
    return null;
  }

  function buildZeroQueryFingerprint({
    year,
    startMonth = 1,
    endMonth = 12,
    monthFlag = "1",
    flow,
    grouping,
    selectTableState,
    hs8
  }) {
    const sortedHs8 = [...new Set((hs8 || []).map((c) => String(c).trim()).filter(Boolean))].sort();
    const sm = String(Number(startMonth)).padStart(2, "0");
    const em = String(Number(endMonth)).padStart(2, "0");
    const mf = monthFlag === "1" ? "1" : "single";
    return `${DICT_VERSION}|${Number(year)}-${sm}..${Number(year)}-${em}|mf=${mf}|${flow}|${grouping}|st=${Number(selectTableState)}|hs8=${sortedHs8.join(",")}`;
  }

  function extractOfficialResponseExcerpt(rawText) {
    const cleaned = String(rawText ?? "")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return cleaned.slice(0, 1000) || "(official empty response body)";
  }

  function escapeEvidenceHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /**
   * 在可见页面上同步渲染当前零结果查询的完整条件与官方返回摘要，确保随后的截图凭证严格对应当前查询而非历史页面。
   */
  async function renderEmptyQueryEvidence({
    year,
    startMonth = 1,
    endMonth = 12,
    monthFlag = "1",
    flow,
    grouping,
    hs8,
    selectTableState,
    officialTotal = 0,
    responseSha256 = "",
    officialResponseExcerpt = "",
    requestParams = "",
    checkedAt = null,
    allowCloseButton = false
  }) {
    if (typeof document === "undefined" || !document.body) {
      return { ok: false, rendered: false, reason: "document_unavailable" };
    }
    if (Number(officialTotal) !== 0) {
      return { ok: false, rendered: false, reason: "official_total_must_be_zero" };
    }
    const validHs8 = validateHs8Batch(hs8);
    const flowSpec = FLOW_SPECS[flow];
    const groupSpec = GROUPING_SPECS[grouping];
    if (!flowSpec || !groupSpec) {
      return { ok: false, rendered: false, reason: "invalid_flow_or_grouping" };
    }
    const queryFingerprint = buildZeroQueryFingerprint({
      year,
      startMonth,
      endMonth,
      monthFlag,
      flow,
      grouping,
      selectTableState,
      hs8: validHs8
    });
    const prev = document.getElementById("mdes-empty-evidence-overlay");
    if (prev && typeof prev.remove === "function") {
      prev.remove();
    }
    const sm = String(Number(startMonth)).padStart(2, "0");
    const em = String(Number(endMonth)).padStart(2, "0");
    const verifiedAt = checkedAt || new Date().toISOString();
    const pageUrl =
      typeof location !== "undefined" && location && location.href
        ? String(location.href)
        : "http://stats.customs.gov.cn/";
    const overlay = document.createElement("div");
    overlay.id = "mdes-empty-evidence-overlay";
    if (typeof overlay.setAttribute === "function") {
      overlay.setAttribute("data-query-fingerprint", queryFingerprint);
      overlay.setAttribute("data-response-sha256", String(responseSha256 || ""));
      overlay.setAttribute("data-official-total", "0");
    }
    overlay.dataset = overlay.dataset || {};
    overlay.dataset.queryFingerprint = queryFingerprint;
    overlay.dataset.responseSha256 = String(responseSha256 || "");
    overlay.dataset.officialTotal = "0";
    overlay.style.cssText =
      "position:fixed;inset:0;z-index:2147483647;background:#ffffff;color:#0f172a;" +
      "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;" +
      "padding:28px 36px;overflow:auto;box-sizing:border-box;border:6px solid #0b3a6e;";
    overlay.innerHTML = `
      <div style="max-width:980px;margin:0 auto;">
        <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #0b3a6e;padding-bottom:12px;margin-bottom:16px;">
          <div>
            <div style="font-size:20px;font-weight:700;color:#0b3a6e;">中国海关总署统计数据查询 · 官方零结果核验凭证</div>
            <div style="font-size:12px;color:#475569;margin-top:4px;">来源页面：${escapeEvidenceHtml(pageUrl)} | 核验时间：${escapeEvidenceHtml(verifiedAt)}</div>
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            <div style="background:#dcfce7;color:#166534;border:1px solid #86efac;padding:6px 12px;font-weight:700;font-size:14px;">官方返回：0 条记录</div>
            ${allowCloseButton ? '<button id="btn-close-empty-evidence" style="padding:6px 10px;border:1px solid #cbd5e1;background:#f8fafc;cursor:pointer;font-size:12px;">关闭</button>' : ""}
          </div>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:16px;">
          <tr><td style="width:200px;padding:7px 10px;border:1px solid #cbd5e1;background:#f8fafc;font-weight:600;">字典版本 / 币制</td><td style="padding:7px 10px;border:1px solid #cbd5e1;">${escapeEvidenceHtml(DICT_VERSION)} / USD (美元)</td></tr>
          <tr><td style="padding:7px 10px;border:1px solid #cbd5e1;background:#f8fafc;font-weight:600;">统计时间区间</td><td style="padding:7px 10px;border:1px solid #cbd5e1;">${escapeEvidenceHtml(`${year}-${sm} .. ${year}-${em}`)}（monthFlag=${escapeEvidenceHtml(monthFlag === "1" ? "1" : "single")}, selectTableState=${escapeEvidenceHtml(String(selectTableState))}）</td></tr>
          <tr><td style="padding:7px 10px;border:1px solid #cbd5e1;background:#f8fafc;font-weight:600;">贸易流向 / 分组</td><td style="padding:7px 10px;border:1px solid #cbd5e1;">${escapeEvidenceHtml(`${flow} (${flowSpec.label}, iEType=${flowSpec.iEType}) / ${grouping} (${groupSpec.label}, ${groupSpec.outerFields.join("+")})`)}</td></tr>
          <tr><td style="padding:7px 10px;border:1px solid #cbd5e1;background:#f8fafc;font-weight:600;">查询税号 (${validHs8.length} 项)</td><td style="padding:7px 10px;border:1px solid #cbd5e1;font-family:monospace;word-break:break-all;">${escapeEvidenceHtml(validHs8.join(", "))}</td></tr>
          <tr><td style="padding:7px 10px;border:1px solid #cbd5e1;background:#f8fafc;font-weight:600;">查询指纹 (Fingerprint)</td><td style="padding:7px 10px;border:1px solid #cbd5e1;font-family:monospace;word-break:break-all;">${escapeEvidenceHtml(queryFingerprint)}</td></tr>
          <tr><td style="padding:7px 10px;border:1px solid #cbd5e1;background:#f8fafc;font-weight:600;">官方接口响应摘要 (SHA-256)</td><td style="padding:7px 10px;border:1px solid #cbd5e1;font-family:monospace;word-break:break-all;">${escapeEvidenceHtml(responseSha256 || "")}</td></tr>
        </table>
        <div style="font-size:13px;font-weight:600;color:#0b3a6e;margin-bottom:6px;">POST /queryData/getQueryDataListByWhere 官方零结果响应原文摘录</div>
        <pre style="background:#f8fafc;border:1px solid #cbd5e1;padding:12px;font-size:12px;white-space:pre-wrap;word-break:break-all;margin:0 0 12px 0;">${escapeEvidenceHtml(officialResponseExcerpt || "暂无数据（官方返回 total=0）")}</pre>
        ${requestParams ? `<div style="font-size:11px;color:#64748b;font-family:monospace;word-break:break-all;">请求参数：${escapeEvidenceHtml(requestParams)}</div>` : ""}
      </div>
    `;
    document.body.appendChild(overlay);
    if (allowCloseButton) {
      const closeBtn = document.getElementById("btn-close-empty-evidence");
      if (closeBtn && typeof closeBtn.addEventListener === "function") {
        closeBtn.addEventListener("click", () => clearEmptyQueryEvidence());
      }
    }
    if (typeof requestAnimationFrame === "function") {
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }
    const mounted = document.getElementById("mdes-empty-evidence-overlay");
    const mountedFp =
      mounted && mounted.dataset && mounted.dataset.queryFingerprint
        ? mounted.dataset.queryFingerprint
        : mounted && typeof mounted.getAttribute === "function"
          ? mounted.getAttribute("data-query-fingerprint")
          : "";
    const verifiedMounted = Boolean(mounted && mountedFp === queryFingerprint);
    return {
      ok: verifiedMounted,
      rendered: verifiedMounted,
      officialTotal: 0,
      queryFingerprint,
      responseSha256: String(responseSha256 || ""),
      elementId: "mdes-empty-evidence-overlay"
    };
  }

  function clearEmptyQueryEvidence() {
    if (typeof document === "undefined") return false;
    const el = document.getElementById("mdes-empty-evidence-overlay");
    if (el && typeof el.remove === "function") {
      el.remove();
      return true;
    }
    return false;
  }

  /**
   * 为手动油猴采集的零结果批次直接生成含完整查询条件与官方响应摘要的 PNG 凭证字节及 SHA-256，
   * 使手动下载的 .empty.png + .manifest.json + .meta.json 无需二次处理即可通过归档导入器校验。
   */
  async function renderEmptyEvidencePngBytes({
    year,
    startMonth = 1,
    endMonth = 12,
    monthFlag = "1",
    flow,
    grouping,
    hs8,
    selectTableState,
    queryFingerprint,
    responseSha256 = "",
    officialResponseExcerpt = "",
    requestParams = "",
    checkedAt = null
  }) {
    if (typeof document === "undefined" || typeof document.createElement !== "function") {
      return null;
    }
    const canvas = document.createElement("canvas");
    if (!canvas || typeof canvas.getContext !== "function") {
      return null;
    }
    const width = 1200;
    const height = 760;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const validHs8 = validateHs8Batch(hs8);
    const flowSpec = FLOW_SPECS[flow] || { label: flow, iEType: "" };
    const groupSpec = GROUPING_SPECS[grouping] || { label: grouping, outerFields: [] };
    const sm = String(Number(startMonth)).padStart(2, "0");
    const em = String(Number(endMonth)).padStart(2, "0");
    const pageUrl =
      typeof location !== "undefined" && location && location.href
        ? String(location.href)
        : "http://stats.customs.gov.cn/";
    const verifiedAt = checkedAt || new Date().toISOString();

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = "#0b3a6e";
    ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, width - 8, height - 8);

    ctx.fillStyle = "#0b3a6e";
    ctx.font = "bold 24px sans-serif";
    ctx.fillText("中国海关总署统计数据查询 · 官方零结果核验凭证", 40, 56);
    ctx.fillStyle = "#166534";
    ctx.font = "bold 18px sans-serif";
    ctx.fillText("官方返回：0 条记录 (officialTotal = 0)", 820, 56);

    ctx.fillStyle = "#334155";
    ctx.font = "14px monospace";
    const wrapLines = (prefix, value, maxChars = 96) => {
      const full = `${prefix}${value}`;
      const out = [];
      for (let i = 0; i < full.length; i += maxChars) {
        out.push(full.slice(i, i + maxChars));
      }
      return out.length ? out : [prefix];
    };

    const rows = [
      ...wrapLines("来源页面: ", pageUrl),
      ...wrapLines("核验时间: ", verifiedAt),
      ...wrapLines("字典/币制: ", `${DICT_VERSION} / USD`),
      ...wrapLines(
        "统计区间: ",
        `${year}-${sm} .. ${year}-${em} (monthFlag=${monthFlag === "1" ? "1" : "single"}, selectTableState=${selectTableState})`
      ),
      ...wrapLines(
        "流向/分组: ",
        `${flow} (${flowSpec.label}, iEType=${flowSpec.iEType}) / ${grouping} (${groupSpec.label}, ${groupSpec.outerFields.join("+")})`
      ),
      ...wrapLines(`查询税号(${validHs8.length}项): `, validHs8.join(", ")),
      ...wrapLines("查询指纹: ", queryFingerprint || ""),
      ...wrapLines("官方响应 SHA-256: ", responseSha256 || ""),
      ...wrapLines("官方响应摘录: ", (officialResponseExcerpt || "暂无数据（total=0）").slice(0, 360)),
      ...(requestParams ? wrapLines("请求参数: ", requestParams.slice(0, 240)) : [])
    ];

    let y = 100;
    for (const line of rows) {
      if (y > height - 30) break;
      ctx.fillText(line, 40, y);
      y += 24;
    }

    if (typeof canvas.toDataURL !== "function") return null;
    const dataUrl = canvas.toDataURL("image/png");
    const prefix = "data:image/png;base64,";
    if (typeof dataUrl !== "string" || !dataUrl.startsWith(prefix)) {
      return null;
    }
    const b64 = dataUrl.slice(prefix.length);
    const bin = atob(b64);
    const pngBytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
      pngBytes[i] = bin.charCodeAt(i);
    }
    if (
      pngBytes.byteLength < 24 ||
      pngBytes[0] !== 0x89 ||
      pngBytes[1] !== 0x50 ||
      pngBytes[2] !== 0x4e ||
      pngBytes[3] !== 0x47
    ) {
      return null;
    }
    const sha256 = await computeSha256Hex(pngBytes);
    return { pngBytes, sha256, width, height };
  }

  /**
   * 低频单飞预检查询总行数与有效 selectTableState（遇 412 / HTML 风控页立即返回熔断信号，绝不盲目重试）
   */
  async function probeOfficialCountAndState({
    year,
    startMonth = 1,
    endMonth = 12,
    monthFlag = "1",
    flow,
    grouping,
    hs8,
    stateCandidates = null,
    currentStartTime = null,
    minDelayMs = MIN_REQUEST_INTERVAL_MS,
    maxDelayMs = DEFAULT_MAX_INTERVAL_MS,
    skipPoliteWaitForUnitTest = false
  }) {
    const anchors = readPortalTimeAnchors();
    const effCurrentStartTime = currentStartTime || anchors.currentStartTime;
    const officialPrimaryState = computeOfficialSelectTableState(
      year,
      startMonth,
      endMonth,
      effCurrentStartTime,
      anchors.currentEndTime
    );
    const candidates =
      Array.isArray(stateCandidates) && stateCandidates.length > 0
        ? stateCandidates.map((x) => Number(x))
        : [officialPrimaryState, ...[1, 2, 3].filter((x) => x !== officialPrimaryState)];
    const activeFetch = getQueryFrameFetch();
    const useBrowserTimeout =
      typeof window !== "undefined" &&
      typeof AbortSignal !== "undefined" &&
      typeof AbortSignal.timeout === "function";
    let requestCount = 0;
    let lastTransientReason = null;
    let primaryFailedReason = null;
    const rejectedFallbackZeroStates = [];
    for (const state of candidates) {
      const isOwningState = Number(state) === officialPrimaryState;
      const params = buildAnnualMonthlyParams({
        year,
        startMonth,
        endMonth,
        monthFlag,
        flow,
        grouping,
        hs8,
        currency: "usd",
        selectTableState: state,
        currentStartTime: effCurrentStartTime,
        forListCheck: true
      });

      const singleProbe = await withSerialFlightLock(
        { minDelayMs, maxDelayMs, skipPoliteWaitForUnitTest },
        async () => {
          requestCount += 1;
          let res;
          try {
            const fetchInit = {
              method: "POST",
              credentials: "include",
              headers: {
                "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                "X-Requested-With": "XMLHttpRequest"
              },
              body: params
            };
            if (useBrowserTimeout) {
              fetchInit.signal = AbortSignal.timeout(120000);
            }
            res = await activeFetch("/queryData/getQueryDataListByWhere", fetchInit);
          } catch (netErr) {
            return {
              halt: false,
              ok: false,
              transientError: true,
              status: 0,
              reason: `fetch_failed:${String(netErr && netErr.message ? netErr.message : netErr)}`
            };
          }
          if (res.status === 412 || res.status === 403 || res.status === 429) {
            return {
              halt: true,
              status: res.status,
              reason: `http_${res.status}`
            };
          }
          if (res.status === 502 || res.status === 503 || res.status === 504) {
            return {
              halt: false,
              ok: false,
              transientError: true,
              status: res.status,
              reason: `http_${res.status}`
            };
          }
          if (!res.ok) {
            return { halt: false, ok: false, status: res.status, reason: `http_${res.status}` };
          }
          const text = await res.text();
          if (text.length === 0) {
            return { halt: true, status: res.status, reason: "captcha_session_gate_required" };
          }
          const total = extractTotalFromListResponseText(text);
          if (total !== null) {
            let zeroEvidence = null;
            if (total === 0) {
              const responseSha256 = await computeSha256Hex(new TextEncoder().encode(text));
              zeroEvidence = {
                queryFingerprint: buildZeroQueryFingerprint({
                  year,
                  startMonth,
                  endMonth,
                  monthFlag,
                  flow,
                  grouping,
                  selectTableState: state,
                  hs8
                }),
                officialTotal: 0,
                responseSha256,
                officialResponseExcerpt: extractOfficialResponseExcerpt(text),
                requestParams: params.toString(),
                checkedAt: new Date().toISOString()
              };
            }
            return { halt: false, ok: true, state, total, zeroEvidence };
          }
          if (isHtmlErrorResponse(text)) {
            return { halt: true, status: res.status, reason: "html_challenge_or_session_expired" };
          }
          return { halt: false, ok: false, status: res.status, reason: "unparseable_probe_response" };
        }
      );

      if (singleProbe.halt) {
        return {
          ok: false,
          state: null,
          total: null,
          isHtmlBlocked: true,
          circuitBreakRequired: true,
          reason: singleProbe.reason,
          requestCount
        };
      }
      if (singleProbe.ok) {
        if (singleProbe.total === 0 && !isOwningState) {
          // 仅允许该月份所属主库（officialPrimaryState）查询成功后确认零值，拒绝备用库（如历史月查当前库）返回的假零
          rejectedFallbackZeroStates.push(Number(state));
          continue;
        }
        return {
          ok: true,
          state: singleProbe.state,
          total: singleProbe.total,
          zeroEvidence: singleProbe.zeroEvidence ?? null,
          isHtmlBlocked: false,
          circuitBreakRequired: false,
          requestCount
        };
      }
      if (singleProbe.transientError) {
        lastTransientReason = singleProbe.reason;
      }
      if (isOwningState) {
        primaryFailedReason =
          singleProbe.reason || (singleProbe.status ? `http_${singleProbe.status}` : "primary_state_failed");
        if (singleProbe.transientError) {
          // 所属主库遭遇 502/503/504/网络故障时立即保留待重试状态，绝不改查备用库生成假零凭证
          return {
            ok: false,
            state: null,
            total: null,
            isHtmlBlocked: false,
            circuitBreakRequired: false,
            transientError: true,
            reason: singleProbe.reason,
            primaryState: officialPrimaryState,
            failedState: Number(state),
            requestCount
          };
        }
      }
    }
    return {
      ok: false,
      state: null,
      total: null,
      isHtmlBlocked: false,
      circuitBreakRequired: false,
      transientError: Boolean(lastTransientReason),
      reason:
        lastTransientReason ||
        primaryFailedReason ||
        (rejectedFallbackZeroStates.length > 0 ? "fallback_zero_rejected" : "no_state_matched"),
      primaryState: officialPrimaryState,
      ...(rejectedFallbackZeroStates.length > 0 ? { rejectedFallbackZeroStates } : {}),
      requestCount
    };
  }

  /**
   * 低频单飞执行单次原字节导出并编码为 Base64（供 browser-harness 本地 IPC 零弹窗直落盘）
   */
  async function fetchRawExportBase64({
    year,
    startMonth = 1,
    endMonth = 12,
    monthFlag = "1",
    flow,
    grouping,
    hs8,
    selectTableState = 3,
    currentStartTime = null,
    minDelayMs = MIN_REQUEST_INTERVAL_MS,
    maxDelayMs = DEFAULT_MAX_INTERVAL_MS,
    skipPoliteWaitForUnitTest = false
  }) {
    const params = buildAnnualMonthlyParams({
      year,
      startMonth,
      endMonth,
      monthFlag,
      flow,
      grouping,
      hs8,
      currency: "usd",
      selectTableState,
      currentStartTime,
      forListCheck: false
    });
    const useBrowserTimeout =
      typeof window !== "undefined" &&
      typeof AbortSignal !== "undefined" &&
      typeof AbortSignal.timeout === "function";

    return withSerialFlightLock(
      { minDelayMs, maxDelayMs, skipPoliteWaitForUnitTest },
      async () => {
        const activeFetch = getQueryFrameFetch();
        let res;
        try {
          const fetchInit = {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: params
          };
          if (useBrowserTimeout) {
            fetchInit.signal = AbortSignal.timeout(175000);
          }
          res = await activeFetch("/queryData/downloadQueryData", fetchInit);
        } catch (netErr) {
          return {
            ok: false,
            status: 0,
            transientError: true,
            circuitBreakRequired: false,
            reason: `fetch_failed:${String(netErr && netErr.message ? netErr.message : netErr)}`
          };
        }

        if (!res.ok) {
          const isGate = [403, 412, 429].includes(res.status);
          const isTransient = [502, 503, 504].includes(res.status);
          return {
            ok: false,
            status: res.status,
            reason: `http_${res.status}`,
            transientError: isTransient,
            circuitBreakRequired: isGate
          };
        }

        const rawBuffer = await res.arrayBuffer();
        const sha256 = await computeSha256Hex(rawBuffer);
        if (rawBuffer.byteLength === 0) {
          return {
            ok: false,
            status: res.status,
            reason: "captcha_session_gate_required",
            circuitBreakRequired: true,
            byteLength: 0,
            sha256
          };
        }
        const inspection = inspectRawCustomsBytes(rawBuffer, hs8);

        if (!inspection.ok) {
          return {
            ok: false,
            status: res.status,
            reason: inspection.reason,
            circuitBreakRequired: Boolean(inspection.circuitBreakRequired),
            byteLength: rawBuffer.byteLength,
            sha256
          };
        }

        const { usdMicrosTotal: _micros, ...serializableInspection } = inspection;
        return {
          ok: true,
          status: res.status,
          selectTableState,
          byteLength: rawBuffer.byteLength,
          sha256,
          base64: bytesToBase64(new Uint8Array(rawBuffer)),
          inspection: serializableInspection
        };
      }
    );
  }

  async function probeSessionHealth(opts = {}) {
    const probe = await probeOfficialCountAndState({
      year: 2024,
      startMonth: 1,
      endMonth: 1,
      monthFlag: "",
      flow: "import",
      grouping: "product",
      hs8: PILOT_HS8,
      ...opts
    });
    return {
      ready: probe.ok && !probe.isHtmlBlocked,
      ...probe
    };
  }

  function buildArchivePaths({ month, flow, grouping, batchKey, revision = "r01" }) {
    const safeBatch = String(batchKey || "CUSTOM").replace(/[^A-Za-z0-9_-]/g, "_");
    const safeRev = /^r\d{2,}$/i.test(revision) ? revision.toLowerCase() : "r01";
    const stem = `customs_${DICT_VERSION}_${month}_${flow}_${grouping}_${safeBatch}_${safeRev}`;
    return {
      stem,
      revision: safeRev,
      archiveRelativeDir: `${month}/${flow}/${grouping}/${safeBatch}/${safeRev}`,
      rawCsvFilename: `${stem}.raw.csv`,
      manifestFilename: `${stem}.manifest.json`,
      metaFilename: `${stem}.meta.json`,
      emptyPngFilename: `${stem}.empty.png`
    };
  }

  const SUITE_BRIDGE_API = Object.freeze({
    version: SUITE_VERSION,
    dictVersion: DICT_VERSION,
    expectedDictSha256: EXPECTED_DICT_SHA256,
    HARD_FLOOR_INTERVAL_MS,
    MIN_REQUEST_INTERVAL_MS,
    DEFAULT_MAX_INTERVAL_MS,
    MAX_SAFE_EXPORT_ROWS,
    PILOT_HS8,
    HS_DICT_202601,
    CATEGORIES_202601,
    BATCH_GROUPS_202601,
    FLOW_SPECS,
    GROUPING_SPECS,
    ORDERED_FLOWS,
    ORDERED_GROUPINGS,
    validateDelayConfig,
    verifyDictionary: verifyEmbeddedDictionary,
    checkSessionReady: probeSessionHealth,
    readPortalTimeAnchors,
    parseLatestPublishedYm,
    clampWindowToLatestPublishedMonth,
    computeOfficialSelectTableState,
    getStateCandidates: defaultStateCandidatesForYear,
    buildAnnualMonthlyParams,
    buildCustomsQueryParams,
    buildManifest,
    inspectRawCustomsBytes,
    probeCount: probeOfficialCountAndState,
    buildZeroQueryFingerprint,
    renderEmptyQueryEvidence,
    clearEmptyQueryEvidence,
    renderEmptyEvidencePngBytes,
    fetchRawExportBase64,
    buildArchivePaths
  });

  // 同时挂载新版桥接名与旧版测试兼容名
  globalThis.__CUSTOMS_SUITE_BRIDGE__ = SUITE_BRIDGE_API;
  globalThis.__MDES_CUSTOMS_COLLECTOR__ = Object.freeze({
    DICT_VERSION,
    EXPECTED_DICT_SHA256,
    PILOT_HS8,
    DEFAULT_GROUP_SIZE,
    HS_DICT_202601,
    CATEGORIES_202601,
    BATCH_GROUPS_202601,
    FLOW_SPECS,
    GROUPING_SPECS,
    ORDERED_FLOWS,
    ORDERED_GROUPINGS,
    reconstructOfficialDictCsvBytes,
    computeSha256Hex,
    verifyEmbeddedDictionary,
    parseSingleNaturalMonth,
    expandSingleNaturalMonths,
    readPortalTimeAnchors,
    parseLatestPublishedYm,
    clampWindowToLatestPublishedMonth,
    validateHs8Batch,
    buildAnnualMonthlyParams,
    buildCustomsQueryParams,
    buildManifest,
    inspectRawCustomsBytes,
    buildArchivePaths
  });

  // 非浏览器环境（Vitest / Node 沙箱核验）到此安全返回
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  window.__CUSTOMS_SUITE_BRIDGE__ = SUITE_BRIDGE_API;

  if (window.top !== window.self) {
    return;
  }

  if (window.__MDES_HARNESS_HEADLESS_UI__) {
    return;
  }

  if (window.__MDES_SUITE_V4_MOUNTED__) {
    return;
  }
  window.__MDES_SUITE_V4_MOUNTED__ = true;

  function cleanAllLegacyPanels() {
    const els = document.querySelectorAll(
      "#customs-suite-panel, #mdes-customs-collector-panel, .customs-suite-panel-class, #export-2024-panel"
    );
    els.forEach((el) => el.remove());
  }

  function triggerBlobDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      a.remove();
      URL.revokeObjectURL(url);
    }, 15000);
  }

  async function initSuiteV4UI() {
    cleanAllLegacyPanels();

    const styleEl = document.createElement("style");
    styleEl.id = "mdes-suite-v4-style";
    styleEl.textContent = `
      #customs-suite-panel {
        position: fixed; top: 68px; right: 18px; width: 468px;
        background: #ffffff; border: 1.5px solid #0b3a6e; border-radius: 8px;
        box-shadow: 0 10px 28px rgba(11, 58, 110, 0.22); z-index: 999999;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
        padding: 14px 16px; box-sizing: border-box; color: #1f2937;
      }
      #customs-suite-panel.minimized {
        width: 280px; padding: 8px 14px; background: #0b3a6e; border-radius: 20px;
      }
      #customs-suite-panel.minimized #customs-ui-body { display: none !important; }
      #customs-suite-panel.minimized .customs-ui-title { color: #ffffff !important; font-size: 13px; }
      #customs-suite-panel.minimized .customs-ui-header { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }
      .customs-ui-header {
        display: flex; justify-content: space-between; align-items: center;
        border-bottom: 1px solid #e5e7eb; padding-bottom: 8px; margin-bottom: 10px; cursor: pointer; user-select: none;
      }
      .customs-ui-title { font-size: 14px; font-weight: 700; color: #0b3a6e; display: flex; align-items: center; gap: 6px; }
      .customs-badge { padding: 2px 6px; border-radius: 4px; font-size: 11px; background: #e8f1fb; color: #0b3a6e; font-weight: 600; }
      .customs-ui-section { margin-bottom: 10px; font-size: 12px; }
      .customs-ui-label { font-weight: 600; margin-bottom: 4px; color: #111827; display: block; }
      .customs-input, .customs-select {
        width: 100%; padding: 5px 6px; border: 1px solid #cbd5e1; border-radius: 4px;
        font-size: 12px; box-sizing: border-box; background: #fff; color: #111827;
      }
      .customs-btn-primary {
        width: 100%; padding: 9px 12px; background: #0b3a6e; color: #ffffff;
        border: none; border-radius: 5px; font-size: 13px; font-weight: 700; cursor: pointer;
      }
      .customs-btn-primary:disabled { background: #94a3b8; cursor: not-allowed; }
      .customs-preview-box {
        max-height: 118px; overflow-y: auto; background: #f8fafc; border: 1px solid #e2e8f0;
        border-radius: 4px; padding: 6px 8px; font-size: 11px; margin-top: 5px;
      }
      .customs-preview-box.collapsed { display: none; }
      .customs-log {
        height: 132px; background: #0f172a; color: #e2e8f0; border-radius: 4px;
        padding: 8px; font-size: 11px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        overflow-y: auto; white-space: pre-wrap; margin-top: 8px; line-height: 1.45;
      }
    `;
    document.head.appendChild(styleEl);

    const groupOptions = BATCH_GROUPS_202601.map(
      (g) => `<option value="GROUP:${g.groupId}">${g.label}</option>`
    ).join("");
    const catOptions = CATEGORIES_202601.map(
      (c) => `<option value="CAT:${c.category}">一级类别 · ${c.category} (${c.count}项)</option>`
    ).join("");

    const panel = document.createElement("div");
    panel.id = "customs-suite-panel";
    panel.innerHTML = `
      <div class="customs-ui-header" id="customs-drag-handle">
        <div class="customs-ui-title">海关医疗器械采集套件 v4.0 <span class="customs-badge" id="suite-dict-badge">校验中</span></div>
        <button id="btn-toggle-min" style="border:none; background:#e8f1fb; color:#0b3a6e; font-size:11px; font-weight:700; padding:3px 8px; border-radius:10px; cursor:pointer;">收起 ▲</button>
      </div>
      <div id="customs-ui-body">
        <div class="customs-ui-section" style="display:flex; gap:8px;">
          <div style="flex:1;">
            <label class="customs-ui-label">统计年份:</label>
            <input type="number" id="inp-year" class="customs-input" value="2024" min="2020" max="2030">
          </div>
          <div style="flex:1;">
            <label class="customs-ui-label">起始月:</label>
            <input type="number" id="inp-m-start" class="customs-input" value="1" min="1" max="12">
          </div>
          <div style="flex:1;">
            <label class="customs-ui-label">截止月:</label>
            <input type="number" id="inp-m-end" class="customs-input" value="12" min="1" max="12">
          </div>
          <div style="flex:1.3;">
            <label class="customs-ui-label">时间粒度:</label>
            <select id="sel-month-flag" class="customs-select">
              <option value="1" selected>按月分列(monthFlag=1)</option>
              <option value="single">逐单自然月独立查</option>
            </select>
          </div>
        </div>

        <div class="customs-ui-section" style="display:flex; gap:10px;">
          <div style="flex:1;">
            <label class="customs-ui-label">进出口流向 (串行):</label>
            <select id="sel-ietype" class="customs-select">
              <option value="both" selected>进口 + 出口 依次低频串行</option>
              <option value="import">仅进口 (iEType=1)</option>
              <option value="export">仅出口 (iEType=0)</option>
            </select>
          </div>
          <div style="width:150px;">
            <label class="customs-ui-label">币制与节流模式:</label>
            <input type="text" class="customs-input" value="USD · 3.5-6.5s单飞" disabled style="background:#f1f5f9; font-weight:700; color:#0b3a6e;">
          </div>
        </div>

        <div class="customs-ui-section">
          <label class="customs-ui-label">统计分组维度 (修复关区/注册地与伙伴/方式全模式):</label>
          <select id="sel-grouping" class="customs-select">
            <option value="all_4" selected>MDES 全部四组依次串行 (全国商品 / 伙伴 / 方式 / 注册地)</option>
            <option value="product">仅全国商品合计 (product → CODE_TS)</option>
            <option value="partner">仅贸易伙伴构成 (partner → ORIGIN_COUNTRY)</option>
            <option value="regime">仅贸易方式构成 (regime → TRADE_MODE)</option>
            <option value="region">仅收发货人注册地·31省市关区 (region → TRADE_CO_PORT)</option>
          </select>
        </div>

        <div class="customs-ui-section">
          <label class="customs-ui-label">医疗器械 HS8 范围 (202601 正式版 164 项):</label>
          <select id="sel-batch" class="customs-select">
            <option value="PILOT" selected>试点单码 · 90181100 心电图记录仪</option>
            <option value="ALL_GROUPS">全行业 164 项 (自动按 G01..G09 每20码分组低频串行)</option>
            ${groupOptions}
            ${catOptions}
            <option value="CUSTOM">自定义字典内 8 位 HS8 子集</option>
          </select>
          <textarea id="txt-custom-hs" class="customs-input" style="height:42px; margin-top:6px; display:none; font-family:monospace;" placeholder="输入 202601 字典内 8 位 HS8 编码..."></textarea>
          <div id="preview-toggle" style="margin-top:5px; font-size:11px; color:#0b3a6e; font-weight:600; cursor:pointer; display:flex; justify-content:space-between; background:#f1f5f9; padding:4px 8px; border-radius:4px;">
            <span id="preview-summary">当前批次编码预览</span>
            <span id="preview-arrow">▲ 展开</span>
          </div>
          <div id="preview-box" class="customs-preview-box collapsed"></div>
        </div>

        <button class="customs-btn-primary" id="btn-start-suite">开始低频合规串行采集原件</button>
        <div class="customs-log" id="suite-log"></div>
      </div>
    `;
    document.body.appendChild(panel);

    const badgeEl = document.getElementById("suite-dict-badge");
    const logEl = document.getElementById("suite-log");
    const btnMin = document.getElementById("btn-toggle-min");
    const headerEl = document.getElementById("customs-drag-handle");
    const selBatch = document.getElementById("sel-batch");
    const txtCustom = document.getElementById("txt-custom-hs");
    const previewToggle = document.getElementById("preview-toggle");
    const previewSummary = document.getElementById("preview-summary");
    const previewArrow = document.getElementById("preview-arrow");
    const previewBox = document.getElementById("preview-box");
    const btnStart = document.getElementById("btn-start-suite");

    function appendLog(msg, color = "#e2e8f0") {
      const div = document.createElement("div");
      div.style.color = color;
      div.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
      logEl.appendChild(div);
      logEl.scrollTop = logEl.scrollHeight;
    }

    try {
      const info = await verifyEmbeddedDictionary();
      const anchors = readPortalTimeAnchors();
      const latest = parseLatestPublishedYm(anchors.currentEndTime);
      badgeEl.textContent = `202601 · ${info.hs8Count}码 已校验`;
      appendLog(
        `字典校验通过: ${info.hs8Count} HS8 / ${info.hs6Count} HS6 / ${info.categoryCount} 大类 | 官网最新公布月份: ${latest ? latest.monthStr : anchors.currentEndTime} | 单飞串行锁已启用`,
        "#86efac"
      );
    } catch (err) {
      badgeEl.textContent = "字典异常";
      btnStart.disabled = true;
      appendLog(String(err), "#fca5a5");
    }

    headerEl.addEventListener("click", (e) => {
      if (["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName)) return;
      panel.classList.toggle("minimized");
      btnMin.textContent = panel.classList.contains("minimized") ? "展开 ▼" : "收起 ▲";
    });

    previewToggle.addEventListener("click", () => {
      previewBox.classList.toggle("collapsed");
      previewArrow.textContent = previewBox.classList.contains("collapsed") ? "▲ 展开" : "▼ 收起";
    });

    function resolveBatches() {
      const val = selBatch.value;
      if (val === "PILOT") return [{ batchKey: "PILOT-90181100", hs8: [...PILOT_HS8] }];
      if (val === "ALL_GROUPS") {
        return BATCH_GROUPS_202601.map((g) => ({ batchKey: g.groupId, hs8: [...g.hs8] }));
      }
      if (val.startsWith("GROUP:")) {
        const gId = val.slice("GROUP:".length);
        const found = BATCH_GROUPS_202601.find((g) => g.groupId === gId);
        return [{ batchKey: gId, hs8: found ? [...found.hs8] : [] }];
      }
      if (val.startsWith("CAT:")) {
        const cat = val.slice("CAT:".length);
        const found = CATEGORIES_202601.find((c) => c.category === cat);
        const idx = CATEGORIES_202601.findIndex((c) => c.category === cat) + 1;
        return [{ batchKey: `CAT${String(idx).padStart(2, "0")}`, hs8: found ? [...found.hs8] : [] }];
      }
      const tokens = txtCustom.value
        .split(/[,;\s\n]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      return [{ batchKey: `SUBSET-${tokens.length}`, hs8: tokens }];
    }

    function refreshPreview() {
      txtCustom.style.display = selBatch.value === "CUSTOM" ? "block" : "none";
      const batches = resolveBatches();
      const allCodes = batches.flatMap((b) => b.hs8);
      previewSummary.textContent = `已选 ${batches.length} 组 · 共 ${allCodes.length} 个医疗器械 HS8`;
      previewBox.innerHTML = allCodes
        .map((code) => {
          const meta = HS_DICT_BY_HS8.get(code);
          return `<div style="display:flex;justify-content:space-between;padding:2px 0;border-bottom:1px dashed #e2e8f0;"><strong style="font-family:monospace;color:#0b3a6e;">${code}</strong><span style="color:#334155;">${meta ? `${meta.category} · ${meta.name}` : "未知编码"}</span></div>`;
        })
        .join("");
    }

    selBatch.addEventListener("change", refreshPreview);
    txtCustom.addEventListener("input", refreshPreview);
    refreshPreview();

    let lastCooldownReqMark = serialFlightState.completedRequestsInRun;

    async function maybeCooldownByActualRequests() {
      const completed = serialFlightState.completedRequestsInRun;
      if (completed > lastCooldownReqMark && completed - lastCooldownReqMark >= BATCH_COOLDOWN_EVERY) {
        lastCooldownReqMark = completed;
        const rest = randomJitterMs(BATCH_COOLDOWN_MIN_MS, BATCH_COOLDOWN_MAX_MS);
        appendLog(`⏳ 已累计 ${completed} 次实际请求，进入阶段呼吸冷却 ${(rest / 1000).toFixed(1)}s...`, "#93c5fd");
        await sleep(rest);
      }
    }

    async function downloadTextFile(text, filename, mime = "application/json;charset=utf-8") {
      triggerBlobDownload(new Blob([text], { type: mime }), filename);
      await sleep(120);
    }

    async function collectWindowRecursive({ year, sMonth, eMonth, monthFlag, flow, grouping, batchKey, hs8 }) {
      const clamped = clampWindowToLatestPublishedMonth({
        year,
        startMonth: sMonth,
        endMonth: eMonth
      });
      if (!clamped.valid) {
        appendLog(
          `⚠ [${year} ${sMonth}-${eMonth}月 ${flow}/${grouping}/${batchKey}] 非法统计时间窗，已跳过`,
          "#fcd34d"
        );
        return;
      }
      if (clamped.skipped) {
        appendLog(
          `⚠ [${year} ${sMonth}-${eMonth}月 ${flow}/${grouping}/${batchKey}] 超出官网最新已公布月份 (${clamped.latestPublishedMonth})，已跳过以防将未公布月份误标为零`,
          "#fcd34d"
        );
        return;
      }
      if (clamped.clamped) {
        appendLog(
          `⚠ [${year} ${sMonth}-${eMonth}月 ${flow}/${grouping}/${batchKey}] 已按官网最新已公布月份 (${clamped.latestPublishedMonth}) 截断为 ${year}-${String(clamped.startMonth).padStart(2, "0")}..${year}-${String(clamped.endMonth).padStart(2, "0")}`,
          "#fcd34d"
        );
      }
      const effStart = clamped.startMonth;
      const effEnd = clamped.endMonth;
      const monthsCovered = Array.from(
        { length: effEnd - effStart + 1 },
        (_, i) => `${year}-${String(effStart + i).padStart(2, "0")}`
      );
      const rangeTag =
        monthFlag === "1"
          ? `${year}_${String(effStart).padStart(2, "0")}-${String(effEnd).padStart(2, "0")}`
          : `${year}-${String(effStart).padStart(2, "0")}`;
      const stem = `customs_${DICT_VERSION}_${rangeTag}_${flow}_${grouping}_${batchKey}_r01`;

      const probe = await probeOfficialCountAndState({
        year,
        startMonth: effStart,
        endMonth: effEnd,
        monthFlag,
        flow,
        grouping,
        hs8
      });
      await maybeCooldownByActualRequests();

      if (probe.circuitBreakRequired) {
        throw new Error(`触发合规风控熔断 (${probe.reason})：已立即停止后续请求，请在页面核验会话状态后再续采`);
      }
      if (!probe.ok) {
        appendLog(
          `✗ [${year} ${effStart}-${effEnd}月 ${flow}/${grouping}/${batchKey}] 官网预检未成功 (${probe.reason})，留待补采`,
          "#fca5a5"
        );
        return;
      }

      if (probe.total === 0) {
        const queryFp = probe.zeroEvidence
          ? probe.zeroEvidence.queryFingerprint
          : buildZeroQueryFingerprint({
              year,
              startMonth: effStart,
              endMonth: effEnd,
              monthFlag,
              flow,
              grouping,
              selectTableState: probe.state,
              hs8
            });
        const respSha = probe.zeroEvidence ? probe.zeroEvidence.responseSha256 : "";
        const respExcerpt = probe.zeroEvidence ? probe.zeroEvidence.officialResponseExcerpt : "";
        const reqParams = probe.zeroEvidence ? probe.zeroEvidence.requestParams : "";
        const checkedAt = probe.zeroEvidence ? probe.zeroEvidence.checkedAt : new Date().toISOString();

        await renderEmptyQueryEvidence({
          year,
          startMonth: effStart,
          endMonth: effEnd,
          monthFlag,
          flow,
          grouping,
          hs8,
          selectTableState: probe.state,
          officialTotal: 0,
          responseSha256: respSha,
          officialResponseExcerpt: respExcerpt,
          requestParams: reqParams,
          checkedAt,
          allowCloseButton: true
        });
        const pngArtifact = await renderEmptyEvidencePngBytes({
          year,
          startMonth: effStart,
          endMonth: effEnd,
          monthFlag,
          flow,
          grouping,
          hs8,
          selectTableState: probe.state,
          queryFingerprint: queryFp,
          responseSha256: respSha,
          officialResponseExcerpt: respExcerpt,
          requestParams: reqParams,
          checkedAt
        });
        const emptyManifest = buildManifest({
          month: monthsCovered[0],
          months: monthsCovered,
          flow,
          grouping,
          hs8,
          emptyHs8: [...hs8],
          probeVerifiedZero: Boolean(pngArtifact)
        });
        const emptyMeta = {
          dictVersion: DICT_VERSION,
          monthRange: `${monthsCovered[0]}..${monthsCovered[monthsCovered.length - 1]}`,
          months: monthsCovered,
          flow,
          grouping,
          batchKey,
          requestedHs8: [...hs8],
          officialTotal: 0,
          queryFingerprint: queryFp,
          officialProbeResponseSha256: respSha || null,
          evidenceViewSynced: true,
          emptyPngFilename: pngArtifact ? `${stem}.empty.png` : null,
          emptyPngSha256: pngArtifact ? pngArtifact.sha256 : null,
          emptyPngDimensions: pngArtifact ? { width: pngArtifact.width, height: pngArtifact.height } : null,
          requiredEmptyPngFilename: `${stem}.empty.png`,
          collectedAt: new Date().toISOString()
        };
        if (pngArtifact) {
          triggerBlobDownload(new Blob([pngArtifact.pngBytes], { type: "image/png" }), `${stem}.empty.png`);
          await sleep(120);
        }
        await downloadTextFile(`${JSON.stringify(emptyManifest, null, 2)}\n`, `${stem}.manifest.json`);
        await downloadTextFile(`${JSON.stringify(emptyMeta, null, 2)}\n`, `${stem}.meta.json`);
        appendLog(
          pngArtifact
            ? `○ [${year} ${effStart}-${effEnd}月 ${flow}/${grouping}/${batchKey}] 官网预检确认 0 条记录，已成套保存 ${stem}.empty.png (SHA256=${pngArtifact.sha256.slice(0, 10)}…) + .manifest.json + .meta.json，可直接归档导入。`
            : `○ [${year} ${effStart}-${effEnd}月 ${flow}/${grouping}/${batchKey}] 官网预检确认 0 条记录；当前环境不支持自动生成 PNG，请保存 ${stem}.empty.png 后执行 node scripts/import-customs-archive.mjs --seal-empty-png 写入摘要。`,
          "#fcd34d"
        );
        return;
      }

      if (probe.total >= MAX_SAFE_EXPORT_ROWS) {
        if (effStart < effEnd) {
          const mid = Math.floor((effStart + effEnd) / 2);
          appendLog(
            `↪ 预检 ${probe.total} 行 >= ${MAX_SAFE_EXPORT_ROWS}，自动二分时间窗为 ${effStart}-${mid}月 与 ${mid + 1}-${effEnd}月`,
            "#93c5fd"
          );
          await collectWindowRecursive({ year, sMonth: effStart, eMonth: mid, monthFlag, flow, grouping, batchKey, hs8 });
          await collectWindowRecursive({ year, sMonth: mid + 1, eMonth: effEnd, monthFlag, flow, grouping, batchKey, hs8 });
          return;
        }
        if (hs8.length > 1) {
          const half = Math.floor(hs8.length / 2);
          appendLog(
            `↪ 单月预检 ${probe.total} 行 >= ${MAX_SAFE_EXPORT_ROWS}，自动二分税号组为 ${batchKey}A / ${batchKey}B`,
            "#93c5fd"
          );
          await collectWindowRecursive({ year, sMonth: effStart, eMonth: effEnd, monthFlag, flow, grouping, batchKey: `${batchKey}A`, hs8: hs8.slice(0, half) });
          await collectWindowRecursive({ year, sMonth: effStart, eMonth: effEnd, monthFlag, flow, grouping, batchKey: `${batchKey}B`, hs8: hs8.slice(half) });
          return;
        }
      }

      const exp = await fetchRawExportBase64({
        year,
        startMonth: effStart,
        endMonth: effEnd,
        monthFlag,
        flow,
        grouping,
        hs8,
        selectTableState: probe.state
      });
      await maybeCooldownByActualRequests();

      if (!exp.ok) {
        if (exp.circuitBreakRequired) {
          throw new Error(`导出响应触发合规熔断 (${exp.reason})：已立即停止，绝不盲目重试`);
        }
        appendLog(`✗ [${year} ${effStart}-${effEnd}月 ${flow}/${grouping}/${batchKey}] 未取得数据 (${exp.reason})，留待补采`, "#fca5a5");
        return;
      }

      const allowedMonthSet = new Set(monthsCovered);
      const outOfRangeMonths = (exp.inspection.observedMonths || []).filter((m) => !allowedMonthSet.has(m));
      const missingMonthCol = monthsCovered.length > 1 && !exp.inspection.hasMonthColumn;
      const unexpectedHs8 = exp.inspection.unexpectedHs8 || [];
      const rowCountMatched = exp.inspection.detailRowCount === probe.total;

      if (!rowCountMatched || unexpectedHs8.length > 0 || outOfRangeMonths.length > 0 || missingMonthCol) {
        appendLog(
          `⚠ [${year} ${effStart}-${effEnd}月 ${flow}/${grouping}/${batchKey}] 导出核验不一致 (导出 ${exp.inspection.detailRowCount} 行 != 预检 ${probe.total} 行，越界税号=${unexpectedHs8.length}，越界月份=${outOfRangeMonths.length})，拒绝确认零值并留待补采！`,
          "#fca5a5"
        );
        return;
      }

      const rawBytes = Uint8Array.from(atob(exp.base64), (c) => c.charCodeAt(0));
      const manifestObj = buildManifest({
        month: monthsCovered[0],
        months: monthsCovered,
        flow,
        grouping,
        hs8,
        emptyHs8: exp.inspection.unreturnedHs8 || [],
        probeVerifiedZero: true
      });
      const metaObj = {
        dictVersion: DICT_VERSION,
        monthRange: `${monthsCovered[0]}..${monthsCovered[monthsCovered.length - 1]}`,
        months: monthsCovered,
        flow,
        grouping,
        batchKey,
        requestedHs8: [...hs8],
        officialProbeTotal: probe.total,
        selectTableState: probe.state,
        savedCsvFilename: `${stem}.raw.csv`,
        sha256: exp.sha256,
        byteLength: exp.byteLength,
        inspection: exp.inspection,
        collectedAt: new Date().toISOString()
      };

      triggerBlobDownload(new Blob([rawBytes], { type: "application/octet-stream" }), `${stem}.raw.csv`);
      await sleep(120);
      await downloadTextFile(`${JSON.stringify(manifestObj, null, 2)}\n`, `${stem}.manifest.json`);
      await downloadTextFile(`${JSON.stringify(metaObj, null, 2)}\n`, `${stem}.meta.json`);
      appendLog(
        `✓ 已保存 ${stem}.raw.csv + ${stem}.manifest.json + ${stem}.meta.json (${exp.inspection.detailRowCount} 行 | USD=${exp.inspection.usdDetailSum} | SHA256=${exp.sha256.slice(0, 10)}…)`,
        "#86efac"
      );
    }

    btnStart.addEventListener("click", async () => {
      if (serialFlightState.inFlight) return;
      const year = Number(document.getElementById("inp-year").value);
      const rawStart = Number(document.getElementById("inp-m-start").value);
      const rawEnd = Number(document.getElementById("inp-m-end").value);
      const gran = document.getElementById("sel-month-flag").value;
      const ieSetting = document.getElementById("sel-ietype").value;
      const grpSetting = document.getElementById("sel-grouping").value;

      const clampedWindow = clampWindowToLatestPublishedMonth({
        year,
        startMonth: rawStart,
        endMonth: rawEnd
      });
      if (!clampedWindow.valid) {
        alert(`起止年份或月份非法: ${year} ${rawStart}..${rawEnd}`);
        return;
      }
      if (clampedWindow.skipped) {
        appendLog(
          `⚠ 所选区间 ${year}-${String(rawStart).padStart(2, "0")}..${year}-${String(rawEnd).padStart(2, "0")} 晚于官网最新已公布月份 (${clampedWindow.latestPublishedMonth})，已中止采集以防将未公布月份误标为零。`,
          "#fcd34d"
        );
        return;
      }
      const mStart = clampedWindow.startMonth;
      const mEnd = clampedWindow.endMonth;
      if (clampedWindow.clamped) {
        const inpEndEl = document.getElementById("inp-m-end");
        if (inpEndEl) inpEndEl.value = String(mEnd);
        appendLog(
          `⚠ 官网最新已公布月份为 ${clampedWindow.latestPublishedMonth}（currentEndTime=${clampedWindow.latestPublishedYm}），已自动将本次查询窗口截断为 ${year}-${String(mStart).padStart(2, "0")}..${year}-${String(mEnd).padStart(2, "0")}。`,
          "#fcd34d"
        );
      }

      let batches;
      try {
        batches = resolveBatches().map((b) => ({ batchKey: b.batchKey, hs8: validateHs8Batch(b.hs8) }));
      } catch (err) {
        alert(err instanceof Error ? err.message : String(err));
        return;
      }

      const flows = ieSetting === "both" ? [...ORDERED_FLOWS] : [ieSetting];
      const groupings = grpSetting === "all_4" ? [...ORDERED_GROUPINGS] : [grpSetting];

      btnStart.disabled = true;
      lastCooldownReqMark = serialFlightState.completedRequestsInRun;
      try {
        for (const b of batches) {
          for (const flow of flows) {
            for (const grouping of groupings) {
              if (gran === "single") {
                for (let m = mStart; m <= mEnd; m++) {
                  await collectWindowRecursive({
                    year,
                    sMonth: m,
                    eMonth: m,
                    monthFlag: "",
                    flow,
                    grouping,
                    batchKey: b.batchKey,
                    hs8: b.hs8
                  });
                }
              } else {
                await collectWindowRecursive({
                  year,
                  sMonth: mStart,
                  eMonth: mEnd,
                  monthFlag: "1",
                  flow,
                  grouping,
                  batchKey: b.batchKey,
                  hs8: b.hs8
                });
              }
            }
          }
        }
        appendLog("✅ 本轮低频合规串行采集完成（已配对生成 .raw.csv 与 .manifest.json，可直接归档导入）。", "#86efac");
      } catch (err) {
        appendLog(`⛔ ${err instanceof Error ? err.message : String(err)}`, "#fca5a5");
      } finally {
        btnStart.disabled = false;
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initSuiteV4UI);
  } else {
    initSuiteV4UI();
  }
})();
