"use strict";
function failProxyResponse(response) {
  if (response.headersSent) {
    response.destroy();
    return;
  }
  response.writeHead(503, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  response.end('{"error":"private_collector_unavailable"}');
}
module.exports = { failProxyResponse };
