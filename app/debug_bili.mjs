// Quick test: replicate the Bilibili space API + WBI signing flow
const MIXIN_KEY_ENC_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35,
  27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13,
  37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4,
  22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52,
];

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function md5Pure(input) {
  function rotateLeft(x, n) { return (x << n) | (x >>> (32 - n)); }
  function addUnsigned(x, y) { return ((x + y) & 0xffffffff) >>> 0; }
  const S = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21];
  const K = [];
  for (let i = 0; i < 64; i++) K.push(Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000));
  const bytes = [];
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    if (code < 0x80) bytes.push(code);
    else if (code < 0x800) { bytes.push(0xc0 | (code >> 6)); bytes.push(0x80 | (code & 0x3f)); }
    else { bytes.push(0xe0 | (code >> 12)); bytes.push(0x80 | ((code >> 6) & 0x3f)); bytes.push(0x80 | (code & 0x3f)); }
  }
  const origLen = bytes.length;
  bytes.push(0x80);
  while ((bytes.length + 8) % 64 !== 0) bytes.push(0);
  const bitLen = origLen * 8;
  for (let i = 0; i < 8; i++) bytes.push((bitLen >>> (i * 8)) & 0xff);
  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
  for (let bi = 0; bi < bytes.length; bi += 64) {
    const M = [];
    for (let i = 0; i < 16; i++) M[i] = bytes[bi + i * 4] | (bytes[bi + i * 4 + 1] << 8) | (bytes[bi + i * 4 + 2] << 16) | (bytes[bi + i * 4 + 3] << 24);
    let A = a0, B = b0, C = c0, D = d0;
    for (let i = 0; i < 64; i++) {
      let F, g;
      if (i < 16) { F = (B & C) | ((~B) & D); g = i; }
      else if (i < 32) { F = (D & B) | ((~D) & C); g = (5 * i + 1) % 16; }
      else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; }
      else { F = C ^ (B | (~D)); g = (7 * i) % 16; }
      F = addUnsigned(F, A); F = addUnsigned(F, K[i]); F = addUnsigned(F, M[g]);
      A = D; D = C; C = B; B = addUnsigned(B, rotateLeft(F, S[i]));
    }
    a0 = addUnsigned(a0, A); b0 = addUnsigned(b0, B); c0 = addUnsigned(c0, C); d0 = addUnsigned(d0, D);
  }
  function wordToHex(w) {
    return ((w >>> 24) & 0xff).toString(16).padStart(2, "0") +
      ((w >>> 16) & 0xff).toString(16).padStart(2, "0") +
      ((w >>> 8) & 0xff).toString(16).padStart(2, "0") +
      (w & 0xff).toString(16).padStart(2, "0");
  }
  return wordToHex(a0) + wordToHex(b0) + wordToHex(c0) + wordToHex(d0);
}

async function fetchBili(url) {
  const resp = await fetch(url, {
    headers: {
      "User-Agent": UA,
      "Referer": "https://www.bilibili.com/",
      "Origin": "https://www.bilibili.com",
      "Accept": "application/json, text/plain, */*",
      "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
      "Cookie": "buvid3=random-buvid3-for-lyra",
    },
  });
  const json = await resp.json();
  console.log(`  [${resp.status}] code=${json.code} message=${json.message}`);
  return json;
}

async function main() {
  // Step 1: Get WBI keys from nav
  console.log("1. Fetching nav for WBI keys...");
  const nav = await fetchBili("https://api.bilibili.com/x/web-interface/nav");
  const imgKey = (nav.data?.wbi_img?.img_url ?? "").split("/").pop()?.split(".")[0] ?? "";
  const subKey = (nav.data?.wbi_img?.sub_url ?? "").split("/").pop()?.split(".")[0] ?? "";
  const rawKey = imgKey + subKey;
  console.log(`   imgKey=${imgKey} subKey=${subKey} rawKey=${rawKey}`);

  if (!imgKey) {
    console.log("FAIL: no wbi_img keys");
    return;
  }

  const mixinChars = [];
  for (const idx of MIXIN_KEY_ENC_TAB) {
    if (idx < rawKey.length) mixinChars.push(rawKey[idx]);
  }
  const mixinKey = mixinChars.join("").slice(0, 32);
  console.log(`   mixinKey=${mixinKey}`);

  // Step 2: WBI sign and call space API
  console.log("\n2. Calling space API with WBI signature...");
  const JLRS_LEOFM_MID = "3493093607213343";
  const params = {
    mid: JLRS_LEOFM_MID,
    ps: "5",
    pn: "1",
    order: "pubdate",
    tid: "0",
    keyword: "",
  };
  const wts = String(Math.floor(Date.now() / 1000));
  params.wts = wts;
  const encoded = Object.keys(params).sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
    .join("&");
  params.w_rid = md5Pure(encoded + mixinKey);

  const qs = new URLSearchParams(params).toString();
  const url = `https://api.bilibili.com/x/space/wbi/arc/search?${qs}`;
  console.log(`   URL: ${url.slice(0, 120)}...`);

  const result = await fetchBili(url);
  if (result.code === 0) {
    const vlist = result.data?.list?.vlist ?? [];
    console.log(`   SUCCESS: ${vlist.length} videos`);
    for (const v of vlist.slice(0, 5)) {
      console.log(`   - [${v.bvid}] ${v.title} (${v.length})`);
    }
    // Check: how many pass the filter?
    const withBaiWan = vlist.filter(v => v.title.includes("百万"));
    console.log(`   With "百万" in title: ${withBaiWan.length}`);
  } else if (result.code === -404) {
    console.log("   UP主不存在或已注销!");
  } else {
    console.log(`   FAILED: code=${result.code}`);
  }
}

main().catch(e => console.error(e));
