// Netlify Function：临时准入工具的云端数据读写
// 通过 Netlify Blobs 底层 HTTP API 读写（端点格式取自 @netlify/blobs SDK 源码）
// 数据以"加密字符串"存储，本函数不接触明文
// 环境变量：NETLIFY_ACCESS_TOKEN（Netlify 个人访问令牌，在站点环境变量中配置）
const API = 'https://api.netlify.com/api/v1/blobs';
const STORE = 'temp-access-data';
const KEY = 'ledger';

exports.handler = async (event) => {
  const siteId = process.env.SITE_ID;                 // Netlify 函数自带
  const token = process.env.NETLIFY_ACCESS_TOKEN;     // 需在站点环境变量配置
  if (!siteId || !token) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ error: '缺少站点配置：请按部署说明配置 NETLIFY_ACCESS_TOKEN 环境变量' }),
    };
  }
  const url = API + '/' + siteId + '/' + STORE + '/' + KEY;

  if (event.httpMethod === 'GET') {
    try {
      const r = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
      if (r.status === 404) {
        return { statusCode: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify({ data: '' }) };
      }
      if (!r.ok) {
        return { statusCode: 502, headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify({ error: '读取失败（HTTP ' + r.status + '）' }) };
      }
      const text = await r.text();
      return { statusCode: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify({ data: text }) };
    } catch (err) {
      return { statusCode: 500, headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify({ error: '读取失败：' + err.message }) };
    }
  }

  if (event.httpMethod === 'POST') {
    let body = {};
    try { body = JSON.parse(event.body || '{}'); } catch (e) { /* 忽略 */ }
    const data = typeof body.data === 'string' ? body.data : '';
    if (!data) {
      return { statusCode: 400, headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify({ error: 'data 不能为空' }) };
    }
    if (data.length > 900000) {
      return { statusCode: 413, headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify({ error: '数据过大（超过900KB），请减少记录' }) };
    }
    try {
      const r = await fetch(url, {
        method: 'PUT',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'text/plain; charset=utf-8' },
        body: data,
      });
      if (!r.ok) {
        return { statusCode: 502, headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify({ error: '写入失败（HTTP ' + r.status + '）' }) };
      }
      return { statusCode: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify({ ok: true }) };
    } catch (err) {
      return { statusCode: 500, headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify({ error: '写入失败：' + err.message }) };
    }
  }

  return { statusCode: 405, headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify({ error: 'method not allowed' }) };
};
