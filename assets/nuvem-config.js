/* Configuração da nuvem (Firebase) do Tio Brasa.
   Projeto Firebase: tio-brasa-1ae1f (conta Google da Brazuka Web), criado em 21/11/2026.
   Esses dados NÃO são senha: podem ficar no site. A senha da loja fica só no Firebase.
   Para desligar a nuvem (voltar a salvar só no aparelho), troque NUVEM_CONFIG por null. */
window.NUVEM_CONFIG = {
  apiKey: 'AIzaSyAryMtRyrgwn28vQq58IJHfKeZYdhsV5OU',
  authDomain: 'tio-brasa-1ae1f.firebaseapp.com',
  projectId: 'tio-brasa-1ae1f',
  storageBucket: 'tio-brasa-1ae1f.firebasestorage.app',
  messagingSenderId: '955511694260',
  appId: '1:955511694260:web:74379a7c1eaae0f71d48e1'
};

// E-mail do login único da loja (já vem preenchido na tela de entrar; a equipe só digita a senha)
window.NUVEM_EMAIL = 'loja@tiobrasa.github.io';

// Nome da "pasta" dos dados na nuvem
window.NUVEM_LOJA = 'tio-brasa';
