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
      outerField1: "CODE_TS",
      outerField2: null,
      outerFields: ["CODE_TS"]
    }),
    partner: Object.freeze({
      key: "partner",
      label: "贸易伙伴构成 (partner)",
      outerField1: "CODE_TS",
      outerField2: "ORIGIN_COUNTRY",
      outerFields: ["CODE_TS", "ORIGIN_COUNTRY"]
    }),
    regime: Object.freeze({
      key: "regime",
      label: "贸易方式构成 (regime)",
      outerField1: "CODE_TS",
      outerField2: "TRADE_MODE",
      outerFields: ["CODE_TS", "TRADE_MODE"]
    }),
    region: Object.freeze({
      key: "region",
      label: "收发货人注册地·31省市关区 (region)",
      outerField1: "CODE_TS",
      outerField2: "TRADE_CO_PORT",
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

  async function computeSha256Hex(rawBufferOrBytes) {
    const view =
      rawBufferOrBytes instanceof Uint8Array
        ? rawBufferOrBytes
        : new Uint8Array(rawBufferOrBytes);
    const copy = new Uint8Array(view.byteLength);
    copy.set(view);
    const digest = await crypto.subtle.digest("SHA-256", copy);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
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

  function defaultStateCandidatesForYear(year) {
    if (year >= 2025) return [1, 3, 2];
    if (year === 2024) return [3, 2, 1];
    return [2, 3, 1];
  }

  function buildAnnualMonthlyParams({
    year,
    startMonth = 1,
    endMonth = 12,
    monthFlag = "1",
    flow,
    grouping,
    hs8,
    currency = "usd",
    selectTableState = 3,
    currentStartTime = "202408",
    forListCheck = false
  }) {
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
      ["outerValue1", validHs8.join(",")]
    ];

    if (groupSpec.outerFields.length > 1) {
      entries.push(["outerField2", groupSpec.outerFields[1]]);
      entries.push(["outerValue2", ""]);
    }

    entries.push(["orderType", "CODE ASC DEFAULT"]);
    entries.push(["selectTableState", String(selectTableState)]);
    entries.push(["currentStartTime", String(currentStartTime)]);

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

  function buildManifest({ month, flow, grouping, hs8, emptyHs8 = [], probeVerifiedZero = false }) {
    parseSingleNaturalMonth(month);
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
      month,
      flow,
      currency: "USD",
      grouping,
      hs8: validHs8,
      emptyHs8: validEmpty
    };
    if (probeVerifiedZero) {
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

    for (let rIdx = 1; rIdx < nonBlank.length; rIdx++) {
      const row = nonBlank[rIdx];
      const hs8 = extractNormalizedHs8Cell(row[hsColIndex]);
      if (!hs8) {
        summaryRowCount++;
        continue;
      }
      const isSecondaryTotal = secondaryLabelIndices.some((cIdx) => {
        const val = String(row[cIdx] ?? "").trim();
        return val === "合计" || val === "总计" || val === "全国合计";
      });
      if (isSecondaryTotal) {
        summaryRowCount++;
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

  async function probeOfficialCountAndState({
    year,
    startMonth = 1,
    endMonth = 12,
    monthFlag = "1",
    flow,
    grouping,
    hs8,
    stateCandidates = null,
    currentStartTime = "202408",
    minDelayMs = MIN_REQUEST_INTERVAL_MS,
    maxDelayMs = DEFAULT_MAX_INTERVAL_MS,
    skipPoliteWaitForUnitTest = false
  }) {
    const candidates = stateCandidates || defaultStateCandidatesForYear(year);
    for (const state of candidates) {
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
        currentStartTime,
        forListCheck: true
      });

      const singleProbe = await withSerialFlightLock(
        { minDelayMs, maxDelayMs, skipPoliteWaitForUnitTest },
        async () => {
          const res = await fetch("/queryData/getQueryDataListByWhere", {
            method: "POST",
            credentials: "include",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
              "X-Requested-With": "XMLHttpRequest"
            },
            body: params
          });
          if (res.status === 412 || res.status === 403 || res.status === 429) {
            return { halt: true, status: res.status, reason: `http_${res.status}` };
          }
          if (!res.ok) {
            return { halt: false, ok: false, status: res.status };
          }
          const text = await res.text();
          const total = extractTotalFromListResponseText(text);
          if (total !== null) {
            return { halt: false, ok: true, state, total };
          }
          if (isHtmlErrorResponse(text)) {
            return { halt: true, status: res.status, reason: "html_challenge_or_session_expired" };
          }
          return { halt: false, ok: false, status: res.status };
        }
      );

      if (singleProbe.halt) {
        return {
          ok: false,
          state: null,
          total: null,
          isHtmlBlocked: true,
          circuitBreakRequired: true,
          reason: singleProbe.reason
        };
      }
      if (singleProbe.ok) {
        return {
          ok: true,
          state: singleProbe.state,
          total: singleProbe.total,
          isHtmlBlocked: false,
          circuitBreakRequired: false
        };
      }
    }
    return {
      ok: false,
      state: null,
      total: null,
      isHtmlBlocked: false,
      circuitBreakRequired: false,
      reason: "no_state_matched"
    };
  }

  async function fetchRawExportBase64({
    year,
    startMonth = 1,
    endMonth = 12,
    monthFlag = "1",
    flow,
    grouping,
    hs8,
    selectTableState = 3,
    currentStartTime = "202408",
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

    return withSerialFlightLock(
      { minDelayMs, maxDelayMs, skipPoliteWaitForUnitTest },
      async () => {
        const res = await fetch("/queryData/downloadQueryData", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: params
        });

        if (!res.ok) {
          return {
            ok: false,
            status: res.status,
            reason: `http_${res.status}`,
            circuitBreakRequired: [403, 412, 429, 502, 503].includes(res.status)
          };
        }

        const rawBuffer = await res.arrayBuffer();
        const sha256 = await computeSha256Hex(rawBuffer);
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
    buildAnnualMonthlyParams,
    buildCustomsQueryParams,
    buildManifest,
    inspectRawCustomsBytes,
    probeCount: probeOfficialCountAndState,
    fetchRawExportBase64,
    buildArchivePaths
  });

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
    validateHs8Batch,
    buildAnnualMonthlyParams,
    buildCustomsQueryParams,
    buildManifest,
    inspectRawCustomsBytes,
    buildArchivePaths
  });

  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }
  window.__CUSTOMS_SUITE_BRIDGE__ = SUITE_BRIDGE_API;
})();
