import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { fetchLawList, fetchLawDetail, parseLawDetail } from '../crawler/flk.js';

describe('fetchLawList', () => {
  beforeEach(() => mockFetch.mockReset());

  it('maps API response to FlkListResult', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        result: {
          data: [{ id: 'id1', title: '中华人民共和国劳动合同法', type: '法律' }],
          pageIndex: 1,
          pageSize: 10,
          totalSizes: 1,
        },
      }),
    });
    const result = await fetchLawList({ page: 1, pageSize: 10 });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].id).toBe('id1');
    expect(result.total).toBe(1);
  });

  it('throws on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 503 });
    await expect(fetchLawList({ page: 1, pageSize: 10 })).rejects.toThrow('HTTP 503');
  });
});

describe('parseLawDetail', () => {
  it('strips HTML and returns plain text content', () => {
    const result = parseLawDetail({
      title: '中华人民共和国劳动合同法',
      body: '<p>第一条 为了完善劳动合同制度&nbsp;保护劳动者合法权益。</p>',
    });
    expect(result.title).toBe('中华人民共和国劳动合同法');
    expect(result.content).toContain('第一条');
    expect(result.content).not.toContain('<p>');
    expect(result.content).not.toContain('&nbsp;');
  });
});
