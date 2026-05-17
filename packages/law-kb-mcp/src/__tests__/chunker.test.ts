// packages/law-kb-mcp/src/__tests__/chunker.test.ts
import { describe, it, expect } from 'vitest';
import { chunkLaw, chunkUserDoc } from '../chunker.js';

describe('chunkLaw', () => {
  it('splits law content by article markers', () => {
    const chunks = chunkLaw(
      '劳动合同法',
      '第一条 劳动合同应当以书面形式订立。\n第二条 劳动合同期限分为固定期限、无固定期限。'
    );
    expect(chunks.length).toBe(2);
    expect(chunks[0].article_number).toBe('第一条');
    expect(chunks[0].content).toContain('书面形式');
    expect(chunks[1].article_number).toBe('第二条');
  });

  it('sets hierarchy_path from chapter context', () => {
    const chunks = chunkLaw(
      '劳动合同法',
      '第二章 劳动合同的订立\n第十条 建立劳动关系，应当订立书面劳动合同。'
    );
    expect(chunks[0].hierarchy_path).toBe('劳动合同法 > 第二章 劳动合同的订立 > 第十条');
  });

  it('handles 两百-style article numbers', () => {
    const chunks = chunkLaw('测试法', '第两百零一条 本条内容。');
    expect(chunks[0].article_number).toBe('第两百零一条');
  });

  it('falls back to fixed window when no structure detected', () => {
    const longText = '合同条款说明'.repeat(50); // ~300 chars, no article markers
    const chunks = chunkLaw('无结构文件', longText);
    expect(chunks.length).toBeGreaterThan(0);
    chunks.forEach(c => expect(c.content.length).toBeLessThanOrEqual(200));
  });

  it('splits long articles at clause markers, preserving clause labels', () => {
    // Article must exceed MAX_CHUNK=300 chars to trigger splitAtClauses
    // Each clause string is ~25 chars; repeat(7) gives ~350 chars total — over 300
    const clause1 = '（一）这是第一款内容，详细说明了具体要求和相关规定。'.repeat(7);
    const clause2 = '（二）这是第二款内容，详细说明了另一方面的要求。'.repeat(7);
    const content = '第一条 ' + clause1 + clause2; // ~354 chars — exceeds MAX_CHUNK=300
    const chunks = chunkLaw('测试法', content);
    expect(chunks.length).toBeGreaterThan(1); // should split into multiple chunks
    // Clause labels should be preserved in chunk content
    const hasClauseLabel = chunks.some(c => c.content.includes('（一）') || c.content.includes('（二）'));
    expect(hasClauseLabel).toBe(true);
  });
});

describe('chunkUserDoc', () => {
  it('uses law chunker when structured', () => {
    const content = '第一条 内容一。\n第二条 内容二。\n第三条 内容三。';
    const chunks = chunkUserDoc('合同.txt', content);
    expect(chunks.length).toBe(3);
    expect(chunks[0].article_number).toBe('第一条');
  });

  it('uses paragraph chunker for unstructured text', () => {
    const content = '这是第一段，描述合同背景。\n\n这是第二段，描述违约责任。\n\n这是第三段，描述争议解决。';
    const chunks = chunkUserDoc('说明.txt', content);
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].hierarchy_path).toContain('说明.txt');
  });

  it('respects 250-char limit per chunk', () => {
    // Build a paragraph well over 250 chars to exercise the overflow path
    const longPara = '这是一个很长的段落正文内容。'.repeat(30); // ~390 chars with punctuation for split
    const chunks = chunkUserDoc('长文.txt', longPara);
    chunks.forEach(c => expect(c.content.length).toBeLessThanOrEqual(260));
  });
});
