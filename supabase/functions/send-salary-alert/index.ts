import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { to, month, salary } = await request.json();
    if (typeof to !== "string" || !to.includes("@") || typeof month !== "string" || typeof salary !== "number" || salary > 0) {
      return new Response(JSON.stringify({ error: "Dados do alerta inválidos." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const apiKey = Deno.env.get("RESEND_API_KEY");
    if (!apiKey) return new Response(JSON.stringify({ error: "RESEND_API_KEY não configurada." }), { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: Deno.env.get("ALERT_FROM_EMAIL") || "Controle financeiro <onboarding@resend.dev>",
        to: [to],
        subject: `Alerta financeiro — salário de ${month}`,
        html: `<h2>Alerta financeiro</h2><p>O salário de <strong>${month}</strong> está em <strong>R$ ${salary.toFixed(2).replace(".", ",")}</strong>.</p><p>Verifique suas despesas no controle financeiro.</p>`,
      }),
    });
    const result = await response.json();
    return new Response(JSON.stringify(result), { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Erro ao enviar alerta." }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
