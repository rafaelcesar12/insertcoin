// =============================================
// INSERT COIN — Image Upload via Cloudinary
// Upload direto do browser, sem backend.
// =============================================
//
// SETUP (gratuito):
// 1. Crie conta em cloudinary.com
// 2. No dashboard, pegue seu "Cloud name"
// 3. Vá em Settings > Upload > Add upload preset
//    - Signing mode: Unsigned
//    - Anote o nome do preset
// 4. Substitua CLOUD_NAME e UPLOAD_PRESET abaixo
//
const CLOUD_NAME    = "doddbixsr";
const UPLOAD_PRESET = "insertcoin_posts";

/**
 * Faz upload de um File para o Cloudinary e retorna a URL pública.
 * @param {File} file
 * @param {string} folder — pasta no Cloudinary (ex: "posts", "avatars")
 * @returns {Promise<string>} URL da imagem
 */
export async function uploadImage(file, folder = "posts") {
  if (!file) throw new Error("Nenhum arquivo selecionado");

  const MAX_MB = 5;
  if (file.size > MAX_MB * 1024 * 1024) {
    throw new Error(`Imagem muito grande. Máximo ${MAX_MB}MB.`);
  }

  const allowed = ["image/jpeg", "image/png", "image/gif", "image/webp"];
  if (!allowed.includes(file.type)) {
    throw new Error("Formato não suportado. Use JPG, PNG, GIF ou WEBP.");
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", UPLOAD_PRESET);
  formData.append("folder", `insertcoin/${folder}`);

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`,
    { method: "POST", body: formData }
  );

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error?.message || "Falha no upload");
  }

  const data = await res.json();
  return data.secure_url;
}

/**
 * Cria um preview local (URL de objeto) antes do upload.
 * @param {File} file
 * @returns {string} URL temporária para preview
 */
export function createPreviewUrl(file) {
  return URL.createObjectURL(file);
}
