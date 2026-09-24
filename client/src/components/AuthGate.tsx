import { FormEvent, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type AuthGateProps = { children: React.ReactNode };

export default function AuthGate({ children }: AuthGateProps) {
  const [sessionReady, setSessionReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSignedIn(Boolean(data.session));
      setSessionReady(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSignedIn(Boolean(currentSession));
      setSessionReady(true);
    });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage("");
    if (!email.trim() || password.length < 6) {
      setMessage("Use um e-mail válido e uma senha com pelo menos 6 caracteres.");
      return;
    }
    setBusy(true);
    const result = mode === "login"
      ? await supabase.auth.signInWithPassword({ email: email.trim(), password })
      : await supabase.auth.signUp({ email: email.trim(), password });
    setBusy(false);
    if (result.error) {
      setMessage(result.error.message.includes("Invalid login") ? "E-mail ou senha incorretos." : result.error.message);
      return;
    }
    if (mode === "signup" && !result.data.session) {
      setMessage("Cadastro criado. Confirme o e-mail recebido e depois entre na sua conta.");
    } else {
      setMessage("Conta pronta. Carregando sua planilha...");
    }
  };

  if (!sessionReady) return <div className="auth-loading">Carregando acesso seguro...</div>;
  if (signedIn) return <>{children}</>;

  return <main className="auth-screen"><section className="auth-card" aria-labelledby="auth-title"><div className="auth-logo">$</div><span className="modal-kicker">PLANILHA FINANCEIRA</span><h1 id="auth-title">Sua conta, seus dados</h1><p>Cada usuário terá uma planilha individual, sem misturar informações com outras pessoas.</p><form onSubmit={submit} className="auth-form"><label>E-MAIL<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="voce@email.com" /></label><label>SENHA<input type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Mínimo de 6 caracteres" /></label><button type="submit" disabled={busy}>{busy ? "Aguarde..." : mode === "login" ? "Entrar" : "Criar minha conta"}</button></form>{message && <p className="auth-message" role="status">{message}</p>}<button type="button" className="auth-switch" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setMessage(""); }}>{mode === "login" ? "Ainda não tenho conta" : "Já tenho uma conta"}</button></section></main>;
}
