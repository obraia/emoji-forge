# Emoji Forge — criador de emojis para Discord

Cria emojis **estáticos (PNG)** e **animados (GIF)** sempre abaixo de **256 KB**, com transparência. Tudo roda no navegador — nenhuma imagem é enviada a servidores.

## Rodando

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # gera dist/
npm run preview    # serve o build de produção com os mesmos cabeçalhos
npm run deploy     # build + wrangler deploy (precisa de `npx wrangler login`)
```

## Deploy (Cloudflare Workers)

O app é estático e publicado como **Workers com assets estáticos** (`wrangler.jsonc`), sem código de Worker.

- **CI** (`.github/workflows/ci.yml`): todo push e PR roda `typecheck` e `build`; push na `main` publica com `wrangler deploy`.
- **Secret necessário** no repositório: `CLOUDFLARE_API_TOKEN` (template *Edit Cloudflare Workers* no painel da Cloudflare). Se o token tiver acesso a mais de uma conta, adicione também `CLOUDFLARE_ACCOUNT_ID`.
- **Cabeçalhos**: `public/_headers` envia COOP/COEP (WASM multi-thread) e cache longo para `/assets/*`.
- **Limite de 25 MiB por arquivo**: o `.wasm` do ONNX Runtime (~27 MB) não vai para o `dist` — o transformers.js o carrega do jsDelivr. O plugin `drop-ort-wasm` no `vite.config.ts` remove a cópia, e o CI falha se algum arquivo acima de 25 MiB voltar a aparecer.

## Recursos

- **Fontes**: imagem única, sequência de imagens (ordenadas por nome, reordenáveis por arrastar), GIF / WebP animado / APNG, e vídeo (MP4, WebM, MOV) com recorte de trecho e FPS.
- **Editor**: recorte quadrado, arrastar para reposicionar, zoom (roda do mouse / slider), girar, espelhar, ajustar/preencher.
- **Linha do tempo**: play/pause (barra de espaço), duração por quadro ou FPS global, duplicar/remover quadros, velocidade.
- **Remoção de fundo por IA** (client-side, [transformers.js](https://github.com/huggingface/transformers.js) + onnxruntime-web):
  - **RMBG 1.4** — uso geral; roda em **WebGPU (fp16)** com fallback automático para **WASM (q8)**. Licença da BRIA: *uso não comercial*.
  - **MODNet** — pessoas/retratos, Apache 2.0; roda em WASM (no WebGPU ele gera máscaras incorretas na versão atual do onnxruntime).
  - Um aquecimento valida o backend ao carregar; se o WebGPU falhar, cai para WASM.
- **Chroma key / varinha mágica**: remove uma cor sólida (conta-gotas ou detecção automática pelas bordas), com tolerância, suavidade e opção de remover só a área conectada às bordas.
- **Otimização automática**: paleta global, otimização entre quadros (só grava pixels que mudaram), mesclagem de quadros repetidos, e uma escada de tentativas (cores → tolerância → tamanho → descarte de quadros) até caber em 256 KB.
- **Transparência no GIF**: GIF só tem transparência de 1 bit; há um corte de alpha ajustável e a opção de suavizar as bordas para o tema escuro/claro do Discord.
- **Prévia** no estilo do Discord (reação, mensagem, emoji grande) nos temas escuro e claro.
- **Idiomas**: português (BR), inglês (US) e espanhol. Na primeira visita usa o idioma do navegador (`navigator.languages`, com inglês como padrão); a escolha no seletor do topo fica salva no `localStorage`.

## Estrutura

```
src/
  App.tsx                 layout, importação (arrastar/colar/selecionar), seletor de idioma
  i18n/                   dicionários (pt-BR é a referência; en-US e es são tipados contra ele) e hook useI18n
  components/             Editor, Timeline, Preview, painéis, importador de vídeo
  lib/
    importers.ts          decodificação de imagens, GIF (ImageDecoder + fallback gifuct-js) e vídeo
    render.ts             transformações, chroma key, renderização dos quadros finais
    hooks.ts              reprodução e recodificação ao vivo (com debounce)
    store.ts              estado (zustand)
  workers/
    encode.worker.ts      codificação PNG/GIF (gifenc) e otimização para 256 KB
    bg.worker.ts          remoção de fundo (transformers.js, WebGPU/WASM)
```

## Observações

- `vite.config.ts` (dev/preview) e `public/_headers` (produção) enviam `Cross-Origin-Opener-Policy` e `Cross-Origin-Embedder-Policy: credentialless` para habilitar WASM multi-thread. Em outro servidor, configure os mesmos cabeçalhos (sem eles tudo funciona, só que o WASM roda em uma thread).
- Os modelos são baixados do Hugging Face na primeira utilização e ficam no cache do navegador.
- WebGPU: Chrome/Edge 113+ (e Safari/Firefox recentes). Sem WebGPU, a IA usa WASM.
