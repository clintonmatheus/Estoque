/* Define versionCode/buildNumber automaticamente nas compilações da nuvem (cada execução = versão maior). */
const fs = require('node:fs');

function aplicarVersao(config, numero) {
  if (!Number.isInteger(numero) || numero < 1) throw new Error('Número de versão inválido');
  return {
    ...config,
    expo: {
      ...config.expo,
      ios: { ...config.expo.ios, buildNumber: String(numero) },
      android: { ...config.expo.android, versionCode: numero },
    },
  };
}

module.exports = { aplicarVersao };

if (require.main === module) {
  const numero = Number(process.argv[2]);
  const config = JSON.parse(fs.readFileSync('app.json', 'utf8'));
  fs.writeFileSync('app.json', JSON.stringify(aplicarVersao(config, numero), null, 2) + '\n');
  console.log(`Versão de compilação: ${numero}`);
}
