// packages/law-kb-mcp/src/crawler/flk.ts
//
// API endpoints verified via DevTools on flk.npc.gov.cn:
//   Search:  POST https://flk.npc.gov.cn/api/
//   Detail:  GET  https://flk.npc.gov.cn/api/detail?id=<id>
// If these 404, re-examine with DevTools and update FLK_BASE/FLK_DETAIL.
//
const FLK_BASE = 'https://flk.npc.gov.cn/api';

export interface FlkLawItem {
  id: string;
  title: string;
  type: string;
  publish_date?: string;
}

export interface FlkListResult {
  items: FlkLawItem[];
  total: number;
  page: number;
}

export interface FlkDetail {
  title: string;
  content: string;
  publish_date?: string;
}

export async function fetchLawList(params: {
  page: number;
  pageSize: number;
  keyword?: string;
}): Promise<FlkListResult> {
  const response = await fetch(FLK_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      searchType: 'title,introduce,body',
      sortTr: 'f_bbrq_s desc',
      page: String(params.page),
      size: String(params.pageSize),
      ...(params.keyword ? { title: params.keyword } : {}),
    }),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json() as {
    result: {
      data: Array<{ id: string; title: string; type?: string; publish?: string }>;
      pageIndex: number;
      totalSizes: number;
    };
  };
  return {
    items: data.result.data.map((item) => ({
      id: item.id,
      title: item.title,
      type: item.type ?? '法律',
      publish_date: item.publish,
    })),
    total: data.result.totalSizes,
    page: data.result.pageIndex,
  };
}

export async function fetchLawDetail(id: string): Promise<FlkDetail> {
  const response = await fetch(`${FLK_BASE}/detail?id=${encodeURIComponent(id)}`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json() as { title: string; body: string; publish?: string };
  return parseLawDetail(data);
}

export function parseLawDetail(raw: { title: string; body: string; publish?: string }): FlkDetail {
  const content = raw.body
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { title: raw.title, content, publish_date: raw.publish };
}

export async function syncAllLaws(
  onProgress: (fetched: number, total: number) => void,
  keyword?: string,
): Promise<number> {
  const { insertLaw } = await import('../indexer.js');
  const pageSize = 20;

  const first = await fetchLawList({ page: 1, pageSize, keyword });
  const total = first.total;
  onProgress(0, total);

  const allItems: FlkLawItem[] = [...first.items];
  const totalPages = Math.ceil(total / pageSize);
  for (let p = 2; p <= totalPages; p++) {
    const { items } = await fetchLawList({ page: p, pageSize, keyword });
    allItems.push(...items);
  }

  let imported = 0;
  for (const item of allItems) {
    try {
      const detail = await fetchLawDetail(item.id);
      insertLaw({
        title: detail.title,
        content: detail.content,
        category: item.type,
        effective_date: detail.publish_date,
        source_url: `https://flk.npc.gov.cn/detail2.html?${item.id}`,
      });
      imported++;
      onProgress(imported, total);
    } catch {
      // Skip individual failures, continue syncing
    }
  }
  return imported;
}
