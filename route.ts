export async function GET() {
  return Response.json({
    ok: true,
    service: "xau-ai-trading-agent",
    time: new Date().toISOString()
  });
}