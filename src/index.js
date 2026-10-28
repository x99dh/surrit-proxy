const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const MEDIA_PATH = /\.(jpe?g|png|gif|webp|svg|mp4|webm|ogg|avi|mov)$/i;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const targetUrl = new URL(`${env.TARGET_ORIGIN}${url.pathname}${url.search}`);

    const headers = new Headers(request.headers);
    headers.delete("Referer");
    headers.delete("Origin");
    headers.delete("Host");
    headers.set("Referer", env.UPSTREAM_REFERER);

    const upstream = new Request(targetUrl, {
      method: request.method,
      headers,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
      redirect: "manual",
    });

    const response = await fetch(upstream);

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("Location");
      if (location) {
        const redirectUrl = new URL(location, targetUrl);
        const status = REDIRECT_STATUSES.has(response.status) ? response.status : 302;
        return Response.redirect(redirectUrl.toString(), status);
      }
    }

    const newHeaders = new Headers(response.headers);
    newHeaders.set("access-control-allow-origin", "*");
    newHeaders.delete("content-encoding");
    newHeaders.delete("content-length");

    const contentType = response.headers.get("Content-Type") || "";
    const isVtt = url.pathname.endsWith(".vtt") && contentType.includes("text/vtt");
    const isPlaylist =
      url.pathname.endsWith(".m3u8") ||
      contentType.includes("application/vnd.apple.mpegurl") ||
      contentType.includes("application/x-mpegurl") ||
      isVtt;

    let resp;
    if ((response.status === 200 || response.status === 206) && isPlaylist && request.method === "GET") {
      if (!isVtt) {
        newHeaders.set("Content-Type", "application/vnd.apple.mpegurl");
      }
      // 播放列表和字幕按原文返回。需要改写其中的地址时，在这里处理 text。
      const text = await response.text();
      resp = new Response(text, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders,
      });
    } else {
      resp = new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders,
      });
    }

    if (MEDIA_PATH.test(url.pathname)) {
      resp.headers.set("Cache-Control", "public, max-age=2592000, immutable");
    }

    return resp;
  },
};
