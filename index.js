const express = require('express');
const bodyParser = require('body-parser');
const ejs = require('ejs');
const puppeteer = require('puppeteer');
const cors = require('cors');
const app = express();
app.use(cors());
app.use(bodyParser.json());

app.post('/gerar-comprovante', async (req, res) => {
  // Dados vindos do Typebot (exemplo)
  const {
    nomeRemetente,
    cpfRemetente,
    bancoRemetente,
    nomeDestinatario,
    cpfDestinatario,
    bancoDestinatario,
    chavePix,
    valor,
    tarifa,
    descricao,
    tipoConta,
    dataHora,
    numeroControle,
    autenticacao
  } = req.body;

  try {
    // Renderiza o template com os dados recebidos
    const html = await ejs.renderFile('./views/comprovante.ejs', {
      nomeRemetente: nomeRemetente || "Virginia Fonseca Costa",
      cpfRemetente: cpfRemetente || "***.907.070-**",
      bancoRemetente: bancoRemetente || "Banco Bradesco S.A.",
      nomeDestinatario: nomeDestinatario || "Daniel De Lima Mendes",
      cpfDestinatario: cpfDestinatario || "***.641.357-**",
      bancoDestinatario: bancoDestinatario || "aw",
      chavePix: chavePix || "a",
      valor: valor || "R$ 1.000,00",
      tarifa: tarifa || "R$ 0,00",
      descricao: descricao || "Corrente",
      tipoConta: tipoConta || "Poupança",
      dataHora: dataHora || new Date().toLocaleString('pt-BR'),
      numeroControle: numeroControle || "9B8C7D59716B63DBB48D5A8A37FABDC",
      autenticacao: autenticacao || "m7efjKlQX2bo+ZMyme7OhIlIlaX8V3X3 Ck1Pz8yj4E="
    });

    // Gera o PDF ou a imagem usando Puppeteer
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.setContent(html, {waitUntil: 'networkidle0'});
    // Ajusta o tamanho da página conforme necessário
    await page.setViewport({ width: 800, height: 1200 });
    
    // Gera a imagem
    const imageBuffer = await page.screenshot({ fullPage: true, type: 'png' });
    await browser.close();

    // Aqui você pode optar por:
    // 1. Retornar a imagem base64
    // 2. Salvar em algum storage (S3, Cloudinary, etc.) e retornar a URL
    // Para simplicidade, retornarei base64

    const base64Image = imageBuffer.toString('base64');
    res.json({ image: `data:image/png;base64,${base64Image}` });
    
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao gerar comprovante' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
