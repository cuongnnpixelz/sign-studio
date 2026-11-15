export async function requestHybridGloss(text, sourceLanguage, targetSign = 'asl', { signal } = {}) {
  const response = await fetch('/api/hybrid/gloss', {
    method: 'POST', signal, headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, sourceLanguage, targetSign: targetSign || 'asl' })
  });
  let result;
  try { result = await response.json(); }
  catch { throw new Error('Chưa kết nối máy chủ Hybrid. Hãy chạy npm run dev hoặc npm start.'); }
  if (!response.ok) throw new Error(result.error || 'Không dịch được câu. Hãy thử lại.');
  if (!Array.isArray(result.tokens) || !result.tokens.length) throw new Error('Không nhận được ký hiệu để phát.');
  return result;
}
