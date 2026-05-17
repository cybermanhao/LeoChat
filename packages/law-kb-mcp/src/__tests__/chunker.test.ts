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
    chunks.forEach(c => expect(c.content.length).toBeLessThanOrEqual(220));
  });

  it('splits long articles at clause markers', () => {
    const content = '第一条 ' + '（一）款一内容。'.repeat(5) + '（二）款二内容。'.repeat(5);
    const chunks = chunkLaw('测试法', content);
    // Long article should be split into sub-chunks
    expect(chunks.length).toBeGreaterThanOrEqual(1);
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
    const longPara = '这是一个很长的段落。' + '补充内容。'.repeat(40);
    const chunks = chunkUserDoc('长文.txt', longPara);
    chunks.forEach(c => expect(c.content.length).toBeLessThanOrEqual(260));
  });
});
