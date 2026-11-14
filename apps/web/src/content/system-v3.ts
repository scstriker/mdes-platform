/** V3.0 指标体系：保留原稿序号（不连续），示意收录接近 33 项。无 ●■▲ 形态列。 */
export type SystemIndicator = {
  seq: string;
  name: string;
  unit: string;
  frequency: string;
  source: string;
  level1: string;
  level2: string;
  phase1: boolean;
  channel: "table" | "file" | "mixed";
};

export const SYSTEM_NOTE =
  "序号沿用原稿编排，未重新编号，因此在 01–38 之间不连续。";

export const LEVEL1_SECTIONS = [
  { id: "l1-reg", name: "一、审评注册与上市准入" },
  { id: "l1-prd", name: "二、产品" },
  { id: "l1-ent", name: "三、企业与机构" },
  { id: "l1-pol", name: "四、政策与监管" },
  { id: "l1-ip", name: "五、知识产权与标准" },
  { id: "l1-trd", name: "六、进出口贸易" },
] as const;

export const SYSTEM_INDICATORS: SystemIndicator[] = [
  // 一
  { seq: "01", name: "医疗器械注册与备案明细", unit: "件", frequency: "日", source: "国家药监局", level1: "一、审评注册与上市准入", level2: "（一）注册与备案", phase1: true, channel: "table" },
  { seq: "02", name: "创新医疗器械审查、获批产品", unit: "件", frequency: "月", source: "国家药监局", level1: "一、审评注册与上市准入", level2: "（二）创新与优先通道", phase1: true, channel: "table" },
  { seq: "03", name: "优先审批医疗器械", unit: "项", frequency: "月", source: "国家药监局", level1: "一、审评注册与上市准入", level2: "（二）创新与优先通道", phase1: true, channel: "table" },
  { seq: "04", name: "医疗器械临床试验登记", unit: "项", frequency: "月", source: "中国临床试验注册中心", level1: "一、审评注册与上市准入", level2: "（二）创新与优先通道", phase1: false, channel: "table" },
  // 二
  { seq: "05", name: "医疗器械UDI规格型号明细", unit: "种/项", frequency: "日", source: "国家药监局", level1: "二、产品", level2: "（三）产品档案", phase1: true, channel: "table" },
  { seq: "06", name: "医疗器械产品技术档案", unit: "—", frequency: "季", source: "国家药监局、注册人", level1: "二、产品", level2: "（三）产品档案", phase1: false, channel: "file" },
  { seq: "07", name: "医疗器械招采成交明细", unit: "元", frequency: "月", source: "中国政府采购网", level1: "二、产品", level2: "（四）产品价格与装机", phase1: false, channel: "table" },
  { seq: "08", name: "大型医用设备配置许可与装机", unit: "台/项", frequency: "年", source: "省级卫生健康部门", level1: "二、产品", level2: "（四）产品价格与装机", phase1: false, channel: "table" },
  // 三
  { seq: "09", name: "医疗器械企业目录及规模统计", unit: "家", frequency: "年", source: "国家药监局、市场监管总局", level1: "三、企业与机构", level2: "（五）医疗器械企业", phase1: false, channel: "table" },
  { seq: "10", name: "企业持证产品", unit: "项", frequency: "季", source: "国家药监局", level1: "三、企业与机构", level2: "（五）医疗器械企业", phase1: false, channel: "table" },
  { seq: "11", name: "专精特新与小巨人医疗器械企业", unit: "家", frequency: "年", source: "工业和信息化部", level1: "三、企业与机构", level2: "（六）企业资质认定", phase1: false, channel: "table" },
  { seq: "12", name: "医疗器械制造业单项冠军企业与统计", unit: "家/项", frequency: "年", source: "工业和信息化部", level1: "三、企业与机构", level2: "（六）企业资质认定", phase1: true, channel: "table" },
  { seq: "13", name: "医疗器械上市企业", unit: "—", frequency: "季", source: "Wind / 交易所", level1: "三、企业与机构", level2: "（七）上市企业年报数据", phase1: true, channel: "table" },
  { seq: "14", name: "上市企业经营与盈利", unit: "亿元/%", frequency: "年", source: "上市公司年报", level1: "三、企业与机构", level2: "（七）上市企业年报数据", phase1: false, channel: "file" },
  { seq: "15", name: "上市企业研发投入", unit: "亿元/%", frequency: "年", source: "上市公司年报", level1: "三、企业与机构", level2: "（七）上市企业年报数据", phase1: false, channel: "file" },
  { seq: "16", name: "上市企业境外信息", unit: "亿元/%", frequency: "年", source: "上市公司年报", level1: "三、企业与机构", level2: "（七）上市企业年报数据", phase1: false, channel: "file" },
  { seq: "19", name: "医疗器械研发创新平台及其分布", unit: "个", frequency: "年", source: "工业和信息化部、科技部", level1: "三、企业与机构", level2: "（八）研发与服务机构", phase1: false, channel: "table" },
  { seq: "20", name: "医学中心与临床研究平台及其分布", unit: "个", frequency: "年", source: "国家卫生健康委、科技部", level1: "三、企业与机构", level2: "（八）研发与服务机构", phase1: false, channel: "table" },
  { seq: "21", name: "医疗器械检验检测机构", unit: "家", frequency: "年", source: "国家药监局、国家认监委", level1: "三、企业与机构", level2: "（八）研发与服务机构", phase1: false, channel: "table" },
  { seq: "22", name: "医疗器械临床试验机构", unit: "家", frequency: "年", source: "国家药监局", level1: "三、企业与机构", level2: "（八）研发与服务机构", phase1: false, channel: "table" },
  // 四
  { seq: "23", name: "国家及地方医疗器械政策条款", unit: "—", frequency: "月", source: "国务院及有关部门等", level1: "四、政策与监管", level2: "（九）政策法规文件", phase1: true, channel: "file" },
  { seq: "24", name: "医疗器械注册审查指导原则", unit: "—", frequency: "月", source: "国家药监局", level1: "四、政策与监管", level2: "（九）政策法规文件", phase1: true, channel: "file" },
  { seq: "25", name: "国家科技计划医疗器械立项项目", unit: "项/万元", frequency: "年", source: "科技部", level1: "四、政策与监管", level2: "（十）政策支持名单", phase1: false, channel: "table" },
  { seq: "26", name: "首台（套）医疗装备目录", unit: "项", frequency: "年", source: "工业和信息化部", level1: "四、政策与监管", level2: "（十）政策支持名单", phase1: false, channel: "table" },
  { seq: "27", name: "医疗装备揭榜挂帅任务", unit: "项", frequency: "年", source: "工业和信息化部、国家药监局", level1: "四、政策与监管", level2: "（十）政策支持名单", phase1: false, channel: "table" },
  { seq: "28", name: "药监注册监管年度报告", unit: "件/家", frequency: "年", source: "国家药监局", level1: "四、政策与监管", level2: "（十一）年报", phase1: true, channel: "file" },
  { seq: "29", name: "医疗器械不良事件年度报告", unit: "件", frequency: "年", source: "国家药监局", level1: "四、政策与监管", level2: "（十一）年报", phase1: false, channel: "file" },
  { seq: "30", name: "医药工业经济运行报告", unit: "亿元/%", frequency: "年", source: "工业和信息化部", level1: "四、政策与监管", level2: "（十一）年报", phase1: false, channel: "file" },
  { seq: "32", name: "医保集采与支付统计公报", unit: "项/%", frequency: "年", source: "国家医保局", level1: "四、政策与监管", level2: "（十一）年报", phase1: false, channel: "file" },
  // 五
  { seq: "33", name: "医疗器械专利与引用", unit: "件", frequency: "年", source: "国家知识产权局等", level1: "五、知识产权与标准", level2: "（十二）知识产权", phase1: false, channel: "table" },
  { seq: "34", name: "医疗器械科研论文", unit: "篇", frequency: "年", source: "文献数据库", level1: "五、知识产权与标准", level2: "（十二）知识产权", phase1: false, channel: "table" },
  { seq: "35", name: "医疗器械国家标准与行业标准", unit: "项", frequency: "年", source: "标准化主管部门", level1: "五、知识产权与标准", level2: "（十三）标准", phase1: false, channel: "table" },
  // 六
  { seq: "38", name: "医疗器械进出口贸易", unit: "亿美元", frequency: "月", source: "海关总署", level1: "六、进出口贸易", level2: "（十四）进出口", phase1: true, channel: "table" },
];

export const SYSTEM_TOTAL = 33;
export const SYSTEM_L1 = 6;
export const SYSTEM_L2 = 14;
export const SYSTEM_PHASE1 = SYSTEM_INDICATORS.filter((i) => i.phase1).length;
