import type { ResumeBlock } from "./schema";

const table = (id: string, widths: number[], rows: string[][], header = true): ResumeBlock => ({
  id,
  type: "table",
  zone: "main",
  visible: true,
  widths,
  rows,
  header
});
const heading = (id: string, text: string): ResumeBlock => ({
  id,
  type: "heading",
  zone: "main",
  visible: true,
  level: 2,
  text,
  underline: false,
  uppercase: false
});

// A fictional, editable A4 example following the MHLW sections, not a government-issued form.
export const japaneseTemplateBlocks = (photo: string): ResumeBlock[] => [
  {
    id: "person-name",
    type: "heading",
    zone: "header",
    visible: true,
    level: 1,
    text: "山田 太郎",
    align: "left"
  },
  {
    id: "document-title",
    type: "paragraph",
    zone: "header",
    visible: true,
    text: "履歴書　2026年10月4日現在",
    align: "left"
  },
  {
    id: "identity",
    type: "columns",
    zone: "header",
    visible: true,
    columns: [
      {
        width: 4,
        blocks: [
          {
            ...table(
              "personal-details",
              [1, 3],
              [
                ["ふりがな", "やまだ たろう"],
                ["氏名", "山田 太郎"],
                ["生年月日", "1997年4月15日（満29歳）"],
                ["性別（任意）", ""],
                ["ふりがな", "とうきょうと れいじく"],
                ["現住所", "東京都例示区1丁目2番3号（架空の住所）"],
                ["電話", ""],
                ["メール", "taro.yamada@example.com"],
                ["別の連絡先", "現住所と同じ"]
              ],
              false
            ),
            zone: "header"
          }
        ]
      },
      {
        width: 1,
        blocks: [
          {
            id: "person-photo",
            type: "image",
            zone: "header",
            visible: true,
            src: photo,
            alt: "写真",
            width: 113,
            height: 151,
            shape: "square"
          }
        ]
      }
    ]
  },
  heading("history-heading", "学歴・職歴"),
  table(
    "history",
    [1, 1, 6],
    [
      ["年", "月", "学歴・職歴（各別に記入）"],
      ["", "", "学歴"],
      ["2015", "4", "例示大学 情報学部 入学"],
      ["2019", "3", "例示大学 情報学部 卒業"],
      ["", "", "職歴"],
      ["2019", "4", "例示ゲーム株式会社 入社　ゲームデザイナーとして勤務"],
      ["2021", "3", "例示ゲーム株式会社 退職"],
      ["2021", "4", "サンプルスタジオ株式会社 入社　シニアゲームデザイナーとして勤務"],
      ["", "", "現在に至る"],
      ["", "", "以上"]
    ]
  ),
  { id: "second-page", type: "page_break", zone: "main", visible: true },
  heading("qualifications-heading", "免許・資格"),
  table(
    "qualifications",
    [1, 1, 6],
    [
      ["年", "月", "免許・資格"],
      ["2018", "11", "基本情報技術者試験 合格"],
      ["2024", "6", "ゲームエコノミー設計講座 修了（例示アカデミー）"]
    ]
  ),
  heading("motivation-heading", "志望の動機・特技・アピールポイント"),
  table(
    "motivation",
    [1, 5],
    [
      [
        "志望の動機",
        "プレイヤーの行動を分析し、分かりやすいゲーム体験を作る仕事を希望しています。応募先の新規タイトルで、進行設計と運営イベントの経験を生かしたいと考えています。"
      ],
      [
        "経験・特技",
        "チュートリアルの改善では、6回のプレイテストを基に仕様を見直し、初回離脱率を32％から24％に下げました。8件の季節イベントでは、企画書の作成から開発・QAとの調整まで担当しました。"
      ]
    ],
    false
  ),
  heading("preferences-heading", "本人希望記入欄"),
  table(
    "preferences",
    [1, 5],
    [["希望", "ゲームデザイナー職を希望します。勤務条件は貴社の規定に従います。"]],
    false
  )
];
