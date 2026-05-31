export class SearchService {
  constructor() {
    this.mini = null;
    this.items = [];
    this.itemById = new Map();
  }

  async index(items) {
    this.items = items;
    this.itemById = new Map(items.map((item) => [item.id, item]));
    const MiniSearch = globalThis.MiniSearch;
    if (!MiniSearch) {
      this.mini = null;
      return;
    }

    this.mini = new MiniSearch({
      fields: ["text", "note", "tags", "sourceTitle"],
      storeFields: ["id", "collectorId"],
      searchOptions: {
        boost: { text: 2, note: 1.5, tags: 1 },
        fuzzy: 0.2,
        prefix: true
      }
    });

    const payload = items.map((item) => ({
      id: item.id,
      collectorId:
        item.collectorId ||
        (Array.isArray(item.collectorIds) ? item.collectorIds[0] : null),
      text: item.text || "",
      note: item.note || "",
      tags: item.tags || [],
      sourceTitle: item.source?.title || ""
    }));

    await this.mini.addAllAsync(payload);
  }

  searchWithMatches(query) {
    const term = query.trim();
    if (!term) {
      return { items: this.items, matchesById: new Map() };
    }

    if (this.mini) {
      const results = this.mini.search(term);
      const matchesById = new Map(
        results.map((result) => [result.id, result.terms || []])
      );
      const items = results
        .map((result) => this.itemById.get(result.id))
        .filter(Boolean);
      return { items, matchesById };
    }

    const lower = term.toLowerCase();
    const terms = lower.split(/\s+/).filter(Boolean);
    const matchesById = new Map();
    const items = this.items.filter((item) => {
      const text = item.text || "";
      const note = item.note || "";
      const tags = (item.tags || []).join(" ");
      const title = item.source?.title || "";
      const haystack = [text, note, tags, title].join(" ").toLowerCase();
      const matched = terms.some((word) => haystack.includes(word));
      if (matched) {
        matchesById.set(item.id, terms);
      }
      return matched;
    });
    return { items, matchesById };
  }

  search(query) {
    const term = query.trim();
    if (!term) return this.items;

    if (this.mini) {
      return this.mini
        .search(term)
        .map((result) => this.itemById.get(result.id))
        .filter(Boolean);
    }

    const lower = term.toLowerCase();
    return this.items.filter((item) => {
      const text = item.text || "";
      const note = item.note || "";
      const tags = (item.tags || []).join(" ");
      const title = item.source?.title || "";
      return [text, note, tags, title].some((value) =>
        value.toLowerCase().includes(lower)
      );
    });
  }
}
