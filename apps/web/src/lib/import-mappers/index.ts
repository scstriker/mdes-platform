import type { IndicatorMapper } from "./types";
import { mapper01 } from "./mapper-01-reg";
import { mapper02 } from "./mapper-02-innov";
import { mapper03 } from "./mapper-03-priority";
import { mapper05 } from "./mapper-05-udi";
import { mapper12 } from "./mapper-12-champion";
import { mapper13 } from "./mapper-13-listed";
import { mapper23 } from "./mapper-23-policy";
import { mapper24 } from "./mapper-24-guideline";
import { mapper28 } from "./mapper-28-annual";
import { mapper38 } from "./mapper-38-trade";

export type { IndicatorMapper, ImportChannel, MapperField } from "./types";

/** 一期 10 项指标 mapper 注册表（按 V3.0 序号升序排列：01, 02, 03, 05, 12, 13, 23, 24, 28, 38） */
export const MAPPERS: IndicatorMapper[] = [
  mapper01,
  mapper02,
  mapper03,
  mapper05,
  mapper12,
  mapper13,
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
