/* Configuração da nuvem (Firebase) do Tio Espeto.
   AVISO PARA O DANIEL: enquanto NUVEM_CONFIG for null, o sistema funciona só no aparelho (sem login).
   Depois de criar o projeto no Firebase, cole aqui os dados de "Configuração do SDK" e o e-mail da loja.
   Esses dados NÃO são senha: podem ficar no site. A senha fica só no Firebase. */
window.NUVEM_CONFIG = null;
/* Exemplo de como fica preenchido:
window.NUVEM_CONFIG = {
  apiKey: 'AIza...',
  authDomain: 'tio-espeto.firebaseapp.com',
  projectId: 'tio-espeto',
  appId: '1:123:web:abc'
};
*/

// E-mail do login único da loja (já vem preenchido na tela de entrar; a equipe só digita a senha)
window.NUVEM_EMAIL = '';

// Nome da "pasta" dos dados na nuvem
window.NUVEM_LOJA = 'tio-espeto';
