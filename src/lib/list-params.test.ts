import { describe, expect, it } from "vitest";
import {
  buildListQuery,
  formatSort,
  nextSortState,
  parseListState,
  parseSort,
  resolveSort,
} from "./list-params";

const KEYS = ["statusId", "ownerUserId", "search"] as const;

describe("parseListState", () => {
  it("宣言したフィルタだけを拾う（他機能のクエリを混ぜない）", () => {
    const search = new URLSearchParams("statusId=abc&utm_source=mail&search=山田");
    expect(parseListState(search, KEYS).filters).toEqual({
      statusId: "abc",
      search: "山田",
    });
  });

  it("空文字のフィルタは無かったことにする", () => {
    const search = new URLSearchParams("statusId=&search=山田");
    expect(parseListState(search, KEYS).filters).toEqual({ search: "山田" });
  });

  it("page が無い・壊れている・0 以下なら 1 ページ目", () => {
    for (const q of ["", "page=abc", "page=0", "page=-3"]) {
      expect(parseListState(new URLSearchParams(q), KEYS).page).toBe(1);
    }
  });

  it("page を数値で読む", () => {
    expect(parseListState(new URLSearchParams("page=4"), KEYS).page).toBe(4);
  });

  it("sort を分解する", () => {
    expect(parseListState(new URLSearchParams("sort=name:desc"), KEYS).sort).toEqual({
      field: "name",
      direction: "desc",
    });
  });
});

describe("parseSort", () => {
  it("向きが asc / desc 以外なら指定なし扱い", () => {
    expect(parseSort("name:sideways")).toBeNull();
    expect(parseSort("name")).toBeNull();
    expect(parseSort(":asc")).toBeNull();
    expect(parseSort(null)).toBeNull();
  });
});

describe("buildListQuery", () => {
  it("既定値は URL に出さない", () => {
    expect(buildListQuery({ filters: {}, page: 1, sort: null })).toBe("");
  });

  it("2 ページ目以降と並び順を入れる", () => {
    const q = buildListQuery({
      filters: { statusId: "abc" },
      page: 3,
      sort: { field: "name", direction: "desc" },
    });
    expect(new URLSearchParams(q).get("page")).toBe("3");
    expect(new URLSearchParams(q).get("sort")).toBe("name:desc");
    expect(new URLSearchParams(q).get("statusId")).toBe("abc");
  });

  it("同じ状態なら常に同じ文字列になる（並び順が安定する）", () => {
    const a = buildListQuery({ filters: { b: "2", a: "1" }, page: 1, sort: null });
    const b = buildListQuery({ filters: { a: "1", b: "2" }, page: 1, sort: null });
    expect(a).toBe(b);
  });

  it("parseListState と往復できる", () => {
    const state = {
      filters: { statusId: "abc", search: "山田" },
      page: 2,
      sort: { field: "created_at", direction: "asc" as const },
    };
    expect(parseListState(new URLSearchParams(buildListQuery(state)), KEYS)).toEqual(state);
  });
});

describe("nextSortState", () => {
  it("未指定の列を押すと昇順", () => {
    expect(nextSortState(null, "name")).toEqual({ field: "name", direction: "asc" });
  });

  it("昇順 → 降順 → 解除 の順に切り替わる", () => {
    const asc = nextSortState(null, "name");
    const desc = nextSortState(asc, "name");
    expect(desc).toEqual({ field: "name", direction: "desc" });
    expect(nextSortState(desc, "name")).toBeNull();
  });

  it("別の列を押したら、その列の昇順から始める", () => {
    const current = { field: "name", direction: "desc" as const };
    expect(nextSortState(current, "created_at")).toEqual({
      field: "created_at",
      direction: "asc",
    });
  });
});

describe("resolveSort", () => {
  it("許可された列だけ通す", () => {
    const sort = { field: "name", direction: "asc" as const };
    expect(resolveSort(sort, ["name", "created_at"])).toEqual(sort);
  });

  it("URL を書き換えて未知の列を指定されても通さない", () => {
    // 通すと order() に渡って Postgres の生エラーが画面に出る
    expect(resolveSort({ field: "password", direction: "asc" }, ["name"])).toBeNull();
  });
});

describe("formatSort", () => {
  it("指定なしは null（クエリに出さない）", () => {
    expect(formatSort(null)).toBeNull();
    expect(formatSort({ field: "name", direction: "asc" })).toBe("name:asc");
  });
});
