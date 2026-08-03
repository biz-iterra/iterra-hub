import { describe, expect, it } from "vitest";
import { toUserMessage } from "./db-error";

describe("toUserMessage", () => {
  describe("NOT NULL 違反（23502）", () => {
    // 実際に管理画面へ出ていた文言
    it("カラム名を画面上の呼び名にして必須と伝える", () => {
      const message = toUserMessage({
        code: "23502",
        message:
          'null value in column "code" of relation "lead_statuses" violates not-null constraint',
      });
      expect(message).toBe("[code] コードは必須です。値を入力してください");
    });

    it("辞書に無いカラムはカラム名のまま返す（誤訳より原文）", () => {
      const message = toUserMessage({
        code: "23502",
        message: 'null value in column "unknown_col" of relation "x" violates not-null constraint',
      });
      expect(message).toBe("[unknown_col] unknown_colは必須です。値を入力してください");
    });

    it("SQLSTATE が無くても文面から判定する（RPC 経由）", () => {
      const message = toUserMessage({
        message: 'null value in column "stage_id" violates not-null constraint',
      });
      expect(message).toBe("[stage_id] リードステージは必須です。値を入力してください");
    });
  });

  describe("UNIQUE 違反（23505）", () => {
    it("単一カラムなら値の重複として伝える", () => {
      const message = toUserMessage({
        code: "23505",
        message: 'duplicate key value violates unique constraint "lead_categories_code_key"',
        details: "Key (code)=(inquiry) already exists.",
      });
      expect(message).toBe("[code] このコードは既に使われています。別の値を入力してください");
    });

    it("複合キーなら組み合わせの重複として伝える", () => {
      const message = toUserMessage({
        code: "23505",
        message: 'duplicate key value violates unique constraint "uq_lead_statuses_stage_code"',
        details: "Key (stage_id, code)=(c000..., no_prospect) already exists.",
      });
      expect(message).toBe(
        "同じリードステージ・コードの組み合わせが既に登録されています。いずれかを変えてください"
      );
    });
  });

  describe("外部キー違反（23503）", () => {
    it("削除時は参照されている旨を伝える", () => {
      const message = toUserMessage(
        {
          code: "23503",
          message: 'update or delete on table "lead_stages" violates foreign key constraint',
        },
        { entityLabel: "リードステージ", operation: "delete" }
      );
      expect(message).toBe(
        "他のデータから参照されているため、このリードステージは削除できません"
      );
    });

    it("作成・更新時は参照先が無い旨を伝える", () => {
      const message = toUserMessage(
        {
          code: "23503",
          message: 'insert or update on table "lead_statuses" violates foreign key constraint',
          details: "Key (stage_id)=(c000...) is not present in table \"lead_stages\".",
        },
        { operation: "create" }
      );
      expect(message).toContain("[stage_id]");
      expect(message).toContain("再読み込み");
    });
  });

  describe("CHECK 違反（23514）", () => {
    it("コード形式は入力条件を日本語で示す", () => {
      const message = toUserMessage({
        code: "23514",
        message:
          'new row for relation "lead_statuses" violates check constraint "chk_lead_statuses_code_format"',
      });
      expect(message).toContain("[code]");
      expect(message).toContain("半角英小文字");
    });

    it("スラッグ形式は slug としてフィールド名を返す", () => {
      const message = toUserMessage({
        code: "23514",
        message: 'violates check constraint "chk_lead_stages_slug_format"',
      });
      expect(message).toContain("[slug]");
    });

    it("色形式は例を添える", () => {
      const message = toUserMessage({
        code: "23514",
        message: 'violates check constraint "lead_statuses_color_format_check"',
      });
      expect(message).toBe("[color] バッジ色は # と16進数6桁で入力してください（例: #E53935）");
    });

    it("表示順は 0 以上と伝える", () => {
      const message = toUserMessage({
        code: "23514",
        message: 'violates check constraint "lead_statuses_sort_order_check"',
      });
      expect(message).toBe("[sort_order] 表示順は0以上の整数で入力してください");
    });

    it("未知の制約は原文を添えて伝える", () => {
      const message = toUserMessage(
        { code: "23514", message: 'violates check constraint "chk_unknown_rule"' },
        { entityLabel: "リードステータス" }
      );
      expect(message).toContain("リードステータス");
      expect(message).toContain("chk_unknown_rule");
    });
  });

  describe("その他", () => {
    it("桁あふれ", () => {
      expect(toUserMessage({ code: "22001", message: "value too long" })).toBe(
        "入力した文字数が上限を超えています"
      );
    });

    it("権限不足", () => {
      expect(toUserMessage({ code: "42501", message: "permission denied" })).toBe(
        "この操作を行う権限がありません"
      );
    });

    it("RLS で弾かれた場合も権限の問題として扱う", () => {
      expect(
        toUserMessage({ message: "new row violates row-level security policy" })
      ).toBe("この操作を行う権限がありません");
    });

    it("対象が見つからない", () => {
      expect(
        toUserMessage({ code: "PGRST116", message: "..." }, { entityLabel: "リードステータス" })
      ).toBe("対象のリードステータスが見つかりません。画面を再読み込みしてください");
    });

    // DB 関数が RAISE EXCEPTION で返す業務エラーは既に日本語なので触らない
    it("日本語のメッセージはそのまま通す", () => {
      const message = toUserMessage({ message: "この法人番号は既に登録されています" });
      expect(message).toBe("この法人番号は既に登録されています");
    });

    it("判定できない英語は汎用文言に原文を添える", () => {
      const message = toUserMessage({ message: "some unexpected failure" });
      expect(message).toBe("処理に失敗しました（some unexpected failure）");
    });

    it("error が無い場合も文言を返す", () => {
      expect(toUserMessage(null)).toBe("処理に失敗しました");
    });
  });
});
