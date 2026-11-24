# Manual de treinamento

1. `EXPO_PUBLIC_PREVIA=1 npx expo export --platform web --output-dir /tmp/previa` (app com dados de exemplo, sem login).
2. Sirva a pasta (`python3 -m http.server 8765` dentro dela) e rode `node capturar_telas.js <pasta_telas>` (Playwright).
3. `python3 gerar_manual.py <pasta_telas> manual.html` e `node html_para_pdf.js $(pwd)/manual.html ../Manual_Estoque.pdf`.
