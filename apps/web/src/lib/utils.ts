import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/** ITEI 文字样式工具类（generated/itei-theme.css 与 itei-utilities.css），同组后者覆盖前者 */
const TEXT_STYLES = [
  "display-hero",
  "title-page",
  "title-section",
  "title-sub",
  "title-nav",
  "title-header",
  "body-lg",
  "body",
  "body-sm",
  "caption",
  "label",
  "button",
  "numeral",
  "numeral-lg",
  "numeral-sm",
  "code",
];

const twMerge = extendTailwindMerge<"itei-text-style">({
  extend: {
    classGroups: {
      "itei-text-style": TEXT_STYLES,
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
