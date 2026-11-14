import type { IndicatorMapper } from "./types";
import { mapper01 } from "./mapper-01-reg";
import { mapper05 } from "./mapper-05-udi";
import { mapper23 } from "./mapper-23-policy";
import { mapper24 } from "./mapper-24-guideline";
import { mapper28 } from "./mapper-28-annual";
import { mapper38 } from "./mapper-38-trade";

export type { IndicatorMapper, ImportChannel, MapperField } from "./types";

/** 一期示意 mapper 注册表；未定字段的标 pending，不阻塞壳 */
export const MAPPERS: IndicatorMapper[] = [
  mapper01,
  mapper05,
  mapper23,
  mapper24,
  mapper28,
  mapper38,
];

export function getMapper(seq: string) {
  return MAPPERS.find((m) => m.seq === seq);
}

export function mappersByChannel(channel: IndicatorMapper["channel"]) {
  return MAPPERS.filter((m) => m.channel === channel);
}
