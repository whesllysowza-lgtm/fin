import { FormEvent, useEffect, useState } from "react";
import { KeyRound, MailCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";

type AuthGateProps = { children: React.ReactNode };
type AuthMode = "login" | "signup" | "forgot" | "recovery";

function friendlyAuthError(message: string) {
  if (message.includes("Invalid login")) return "E-mail ou senha incorretos.";
  if (message.toLowerCase().includes("password should be at least")) return "A senha precisa ter pelo menos 6 caracteres.";
  if (message.toLowerCase().includes("user already registered")) return "Este e-mail já está cadastrado. Tente entrar.";
  return message;
}

export default function AuthGate({ children }: AuthGateProps) {
  const [sessionReady, setSessionReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSignedIn(Boolean(data.session));
      setSessionReady(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((event, currentSession) => {
      if (!active) return;
      if (event === "PASSWORD_RECOVERY") setMode("recovery");
      setSignedIn(Boolean(currentSession));
      setSessionReady(true);
    });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);

  const resetNotice = () => { setMessage(""); setError(""); };
  const goTo = (nextMode: AuthMode) => { setMode(nextMode); setPassword(""); setPasswordConfirm(""); resetNotice(); };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    resetNotice();
    setBusy(true);
    if (mode === "forgot") {
      if (!email.trim()) { setBusy(false); setError("Informe o e-mail cadastrado."); return; }
      const redirectTo = `${window.location.origin}/`;
      const result = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
      setBusy(false);
      if (result.error) setError(friendlyAuthError(result.error.message));
      else setMessage("Enviamos um link de recuperação. Verifique sua caixa de entrada e também o spam.");
      return;
    }
    if (mode === "recovery") {
      if (password.length < 6) { setBusy(false); setError("A nova senha precisa ter pelo menos 6 caracteres."); return; }
      if (password !== passwordConfirm) { setBusy(false); setError("As senhas não conferem."); return; }
      const result = await supabase.auth.updateUser({ password });
      setBusy(false);
      if (result.error) setError(friendlyAuthError(result.error.message));
      else { setMessage("Senha alterada com sucesso. Sua conta está protegida."); setPassword(""); setPasswordConfirm(""); setMode("login"); }
      return;
    }
    if (!email.trim() || password.length < 6) { setBusy(false); setError("Use um e-mail válido e uma senha com pelo menos 6 caracteres."); return; }
    const result = mode === "login"
      ? await supabase.auth.signInWithPassword({ email: email.trim(), password })
      : await supabase.auth.signUp({ email: email.trim(), password });
    setBusy(false);
    if (result.error) { setError(friendlyAuthError(result.error.message)); return; }
    if (mode === "signup" && !result.data.session) setMessage("Cadastro criado. Confirme o e-mail recebido e depois entre na sua conta.");
    else setMessage("Conta pronta. Carregando sua planilha...");
  };

  if (!sessionReady) return <div className="auth-loading">Carregando acesso seguro...</div>;
  if (signedIn && mode !== "recovery") return <>{children}</>;

  const isRecovery = mode === "recovery";
  const title = isRecovery ? "Criar nova senha" : mode === "forgot" ? "Recuperar acesso" : "Sua conta, seus dados";
  const description = isRecovery ? "Escolha uma nova senha para voltar à sua planilha financeira." : mode === "forgot" ? "Enviaremos um link seguro para o seu e-mail cadastrado." : "Cada usuário terá uma planilha individual, sem misturar informações com outras pessoas.";
  return <main className="auth-screen"><section className="auth-card" aria-labelledby="auth-title"><div className="auth-logo">{isRecovery || mode === "forgot" ? <KeyRound size={24} /> : "$"}</div><span className="modal-kicker">PLANILHA FINANCEIRA</span><h1 id="auth-title">{title}</h1><p>{description}</p><form onSubmit={submit} className="auth-form">
    {!isRecovery && <label>E-MAIL<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="voce@email.com" /></label>}
    {mode !== "forgot" && <label>{isRecovery ? "NOVA SENHA" : "SENHA"}<input type="password" autoComplete={isRecovery ? "new-password" : mode === "login" ? "current-password" : "new-password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Mínimo de 6 caracteres" /></label>}
    {isRecovery && <label>CONFIRMAR NOVA SENHA<input type="password" autoComplete="new-password" value={passwordConfirm} onChange={(event) => setPasswordConfirm(event.target.value)} placeholder="Digite novamente" /></label>}
    <button type="submit" disabled={busy}>{busy ? "Aguarde..." : isRecovery ? "Salvar nova senha" : mode === "forgot" ? "Enviar link por e-mail" : mode === "login" ? "Entrar" : "Criar minha conta"}</button>
  </form>{message && <p className="auth-message" role="status"><MailCheck size={15} /> {message}</p>}{error && <p className="auth-error" role="alert">{error}</p>}
  {mode === "login" && <button type="button" className="auth-forgot" onClick={() => goTo("forgot")}>Esqueci minha senha</button>}
  {!isRecovery && <button type="button" className="auth-switch" onClick={() => goTo(mode === "login" || mode === "forgot" ? "signup" : "login")}>{mode === "signup" ? "Já tenho uma conta" : "Ainda não tenho conta"}</button>}
  {mode === "forgot" && <button type="button" className="auth-back" onClick={() => goTo("login")}>Voltar para entrar</button>}
  </section></main>;
}
