# 🎮 INSERT COIN — Rede Social Gamer

Protótipo funcional da rede social gamer Insert Coin com Firebase Authentication + Firestore.

---

## 📁 Estrutura de Arquivos

```
insert-coin/
├── index.html          ← Tela de Login
├── signup.html         ← Cadastro (3 etapas)
├── home.html           ← Home / Feed (protegida)
├── profile.html        ← Perfil do usuário (protegido)
├── style.css           ← Estilos globais (dark/neon/gamer)
├── firebase-config.js  ← ⚠️ Credenciais Firebase (EDITE AQUI)
├── auth.js             ← Helpers de autenticação
├── firestore.js        ← Helpers do Firestore
├── home.js             ← Lógica da home
├── profile.js          ← Lógica do perfil
└── README.md           ← Este arquivo
```

---

## 🔥 Configuração Firebase (OBRIGATÓRIO)

### 1. Criar projeto Firebase

1. Acesse https://console.firebase.google.com
2. Clique em **"Adicionar projeto"**
3. Dê um nome (ex: `insert-coin`)
4. Desative o Google Analytics se preferir
5. Clique em **"Criar projeto"**

### 2. Ativar Authentication

1. No menu lateral: **Authentication → Primeiros passos**
2. Aba **Método de login**
3. Ative **E-mail/senha**

### 3. Criar Firestore Database

1. No menu lateral: **Firestore Database → Criar banco de dados**
2. Selecione **Modo de teste** (para desenvolvimento)
3. Escolha a região (ex: `southamerica-east1` para Brasil)

### 4. Obter credenciais do app

1. Clique no ícone **⚙️ Configurações do projeto**
2. Role até **"Seus apps"**
3. Clique em **`</>`** para adicionar app Web
4. Registre com um nome (ex: `insert-coin-web`)
5. Copie o objeto `firebaseConfig`

### 5. Editar firebase-config.js

Abra `firebase-config.js` e substitua os valores:

```javascript
const firebaseConfig = {
  apiKey: "SUA_API_KEY_REAL",
  authDomain: "SEU_PROJETO.firebaseapp.com",
  projectId: "SEU_PROJETO_ID",
  storageBucket: "SEU_PROJETO.appspot.com",
  messagingSenderId: "SEU_MESSAGING_ID",
  appId: "SEU_APP_ID"
};
```

---

## 🌐 Deploy no Netlify (gratuito)

### Opção A — Interface Web
1. Acesse https://netlify.com → **"Add new site"**
2. Escolha **"Deploy manually"**
3. Arraste a pasta `insert-coin` para a área de upload
4. Pronto! Netlify gera uma URL pública

### Opção B — GitHub + Netlify CI
1. Suba o projeto em um repositório GitHub
2. No Netlify: **"New site from Git"**
3. Conecte o repositório
4. Build command: deixe vazio
5. Publish directory: `/` (raiz)
6. Deploy!

---

## ▲ Deploy na Vercel (gratuito)

1. Acesse https://vercel.com → **"New Project"**
2. Importe do GitHub ou faça upload manual
3. Framework preset: **"Other"**
4. Deploy!

---

## ✅ Funcionalidades Implementadas

| Feature | Status |
|---|---|
| Cadastro com e-mail/senha | ✅ |
| Login / Logout | ✅ |
| Redefinição de senha | ✅ |
| Perfil salvo no Firestore | ✅ |
| Editar perfil | ✅ |
| Sistema de XP e nível | ✅ |
| Criar posts no feed | ✅ |
| Curtir posts (+XP) | ✅ |
| Feed global em tempo real | ✅ |
| Layout responsivo mobile | ✅ |
| Proteção de rotas | ✅ |
| Toasts de notificação | ✅ |

## 🔜 Funcionalidades Futuras (estrutura pronta)

- Sistema de amigos
- Squads (coleção `squads` já criada)
- Eventos & eSports (coleção `events` já criada)
- Comentários em posts
- Matchmaking por jogos/plataforma
- Upload de avatar e banner (Firebase Storage)
- Notificações em tempo real (Firestore listeners)
- Monetização / banners patrocinados

---

## 🎨 Paleta de Cores

| Nome | Hex |
|---|---|
| Background | `#050510` |
| Card | `#0a0b1e` |
| Neon Verde | `#00ffc8` |
| Neon Azul | `#00e0ff` |
| Neon Roxo | `#7b2cff` |
| Texto | `#f5f7ff` |
| Texto Muted | `#a4a7c4` |

---

## 💡 Dicas de Expansão

- Para adicionar **upload de avatar**: habilite Firebase Storage e use `uploadBytes + getDownloadURL`
- Para **feed em tempo real**: substitua `getDocs` por `onSnapshot` no `home.js`
- Para **notificações**: crie uma coleção `notifications` e use listeners
- Para **busca de jogadores**: implemente índices compostos no Firestore (Firestore Index)

---

Feito com ❤️ + neon + caffeine
