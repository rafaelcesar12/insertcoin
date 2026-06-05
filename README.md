# 🎮 INSERT COIN v2 — Guia de Atualização

## 📁 Arquivos desta versão

Substitua os arquivos abaixo no seu repositório GitHub (ou suba todos novamente para a Vercel):

| Arquivo | O que mudou |
|---|---|
| `firestore.js` | Amigos, squads, presença online, admin, localização |
| `home.html` + `home.js` | Feed real, fotos, notícias, squads, players online |
| `profile.html` + `profile.js` | Localização, links de plataformas |
| `squads.html` + `squads.js` | Página completa de squads |
| `friends.html` | Página de amigos com busca e pedidos |
| `admin.html` | Painel de administração |
| `upload.js` | Helper de upload de imagens (Cloudinary) |

Arquivos **não alterados** (não precisa substituir):
- `firebase-config.js`, `auth.js`, `style.css`, `index.html`, `signup.html`

---

## 🖼️ Configurar Upload de Imagens (Cloudinary — GRATUITO)

O Cloudinary oferece 25GB gratuitos para armazenar imagens.

1. Crie conta em **[cloudinary.com](https://cloudinary.com)** (pode usar Google)
2. No dashboard, copie o seu **Cloud name** (ex: `dxyz123abc`)
3. No menu lateral: **Settings → Upload**
4. Role até **"Upload presets"** e clique em **"Add upload preset"**
5. Configure:
   - **Signing mode**: `Unsigned`
   - **Preset name**: anote (ex: `insertcoin_posts`)
6. Clique em **Save**
7. Abra `upload.js` e substitua:
```javascript
const CLOUD_NAME    = "dxyz123abc";       // seu Cloud name
const UPLOAD_PRESET = "insertcoin_posts"; // seu preset name
```

> Sem isso, o upload de fotos não funcionará, mas o resto do app funciona normalmente.

---

## 🔐 Ativar seu perfil de Admin

Após criar sua conta na Insert Coin:

1. Acesse o **Firebase Console → Firestore**
2. Clique na coleção `users`
3. Encontre o documento com o seu UID (mesmo e-mail que você usou)
4. Clique em **Editar (lápis)**
5. Encontre o campo `isAdmin` e mude para `true`
6. Salve

Pronto — o menu Admin aparecerá na sidebar e você poderá acessar `insertcoin-chi.vercel.app/admin.html`.

---

## ✅ Funcionalidades desta versão

| Feature | Status |
|---|---|
| Players online em tempo real | ✅ |
| Squads — criar, entrar, sair, deletar | ✅ |
| Sistema de amigos completo | ✅ |
| Pedidos de amizade | ✅ |
| Post com foto (Cloudinary) | ✅ |
| Deletar post | ✅ |
| Comentários nos posts | ✅ |
| Curtir / descurtir posts | ✅ |
| Notícias gamer (IGN BR, The Enemy, Voxel) | ✅ |
| Perfil com cidade / estado / país | ✅ |
| Links Discord, Steam, Epic, Xbox, PSN, Twitch, YouTube | ✅ |
| Painel Admin (banir, promover, dar XP) | ✅ |

---

## 📰 Sobre as Notícias

As notícias são carregadas via **rss2json.com** (serviço gratuito que converte RSS em JSON).
- IGN Brasil, The Enemy e Voxel são carregados automaticamente
- Se algum feed falhar, a mensagem de erro aparece sem quebrar o app

---

## 🛠️ Próximas features sugeridas

- Upload de avatar no perfil (Cloudinary já está pronto)
- Notificações em tempo real (Firestore `onSnapshot`)
- Eventos e eSports
- Matchmaking por jogos em comum
- Página de perfil público de outros usuários
