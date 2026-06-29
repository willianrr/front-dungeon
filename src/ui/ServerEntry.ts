import { createCharacter, listCharacters, login, register, type AuthResult } from '../net/api';

// Entrada principal: email/senha + nome do personagem, com
// botoes SEPARADOS de "Entrar" (login) e "Criar conta" (registro). Assim cada
// acao e explicita e nao gera aquele 401 "esperado" do fallback automatico.

export interface ServerSession {
  token: string;
  characterId: number;
  name: string;
}

const TEMPLATE = `
  <section class="onboarding-shell login-shell" aria-labelledby="srv-title">
    <div class="onboarding-brand">
      <span>ARANNA</span>
      <h1 id="srv-title">Servidor</h1>
      <p>Entre ou crie sua conta</p>
    </div>
    <form class="onboarding-panel" id="srv-form">
      <label for="srv-email">Email</label>
      <input id="srv-email" name="email" type="email" autocomplete="username" required />

      <label for="srv-pass">Senha</label>
      <input id="srv-pass" name="password" type="password" autocomplete="current-password" required />

      <label for="srv-name">Nome do personagem</label>
      <input id="srv-name" name="character" type="text" maxlength="24" placeholder="Heroi" />

      <div style="display:flex;gap:8px;margin-top:4px">
        <button type="button" id="srv-login" style="flex:1">Entrar</button>
        <button type="button" id="srv-register" style="flex:1">Criar conta</button>
      </div>
      <p id="srv-msg" style="min-height:1.2em;margin:0"></p>
    </form>
  </section>
`;

export function showServerEntry(): Promise<ServerSession> {
  return new Promise((resolve) => {
    const root = document.createElement('div');
    root.id = 'onboarding';
    root.className = 'onboarding-screen';
    root.innerHTML = TEMPLATE;
    document.body.append(root);

    const email = root.querySelector('#srv-email') as HTMLInputElement;
    const password = root.querySelector('#srv-pass') as HTMLInputElement;
    const name = root.querySelector('#srv-name') as HTMLInputElement;
    const loginBtn = root.querySelector('#srv-login') as HTMLButtonElement;
    const registerBtn = root.querySelector('#srv-register') as HTMLButtonElement;
    const message = root.querySelector('#srv-msg') as HTMLElement;

    const setBusy = (busy: boolean): void => {
      loginBtn.disabled = busy;
      registerBtn.disabled = busy;
    };

    const info = (text: string): void => {
      message.style.color = '#ffd479';
      message.textContent = text;
    };
    const fail = (text: string): void => {
      message.style.color = '#ff9090';
      message.textContent = text;
    };

    // Apos autenticar, pega o primeiro personagem ou cria um com o nome digitado.
    const finish = async (auth: AuthResult): Promise<void> => {
      info('Carregando personagem...');
      const characters = await listCharacters(auth.token);
      const character = characters[0] ?? (await createCharacter(auth.token, name.value.trim() || 'Heroi'));
      root.remove();
      resolve({ token: auth.token, characterId: character.id, name: character.name });
    };

    const run = async (action: () => Promise<AuthResult>, working: string): Promise<void> => {
      setBusy(true);
      info(working);
      try {
        await finish(await action());
      } catch (error) {
        fail(error instanceof Error ? error.message : 'Erro ao conectar');
        setBusy(false);
      }
    };

    loginBtn.addEventListener('click', () => {
      void run(() => login(email.value, password.value), 'Entrando...');
    });
    registerBtn.addEventListener('click', () => {
      void run(() => register(email.value, password.value), 'Criando conta...');
    });
  });
}
