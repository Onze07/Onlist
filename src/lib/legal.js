// Ao alterar os textos de forma relevante, aumente a versão: todos precisam aceitar de novo.
export const LEGAL_VERSION = '2026-10-02'
export const LEGAL_UPDATED = '02/10/2026'

export const CONTROLLER = {
  name: 'ELINTON DULTRA DE OLIVEIRA',
  cnpj: '36.847.935/0001-55',
  email: 'onlist@onze07.com',
  city: 'Pimenta Bueno/RO',
}

const c = CONTROLLER

export const PRIVACY = {
  title: 'Política de Privacidade',
  sections: [
    {
      h: '1. Quem somos',
      p: [
        `O Onlist é operado por ${c.name}, inscrito no CNPJ ${c.cnpj}, com sede em ${c.city} ("Onlist", "nós"). Somos o controlador dos dados pessoais tratados no aplicativo, nos termos da Lei nº 13.709/2018 (Lei Geral de Proteção de Dados – LGPD).`,
        `Contato do encarregado de dados (DPO): ${c.email}.`,
      ],
    },
    {
      h: '2. Dados que coletamos',
      p: [
        'Dados da conta Google, fornecidos quando você entra: nome, e-mail, foto de perfil e identificador da conta.',
        'Dados que você cadastra: nome da família, listas, itens, quantidades, preços, categorias, mercados, compras finalizadas e observações.',
        'Dados de uso do grupo: quem marcou ou finalizou uma compra e quando, e os membros de cada família.',
        'Mensagens de feedback que você enviar pelo app.',
        'Dados técnicos necessários ao funcionamento: tipo de dispositivo e navegador, registros de acesso e, se você ativar notificações, o identificador do aparelho para envio de avisos.',
        'Não coletamos dados sensíveis, dados de cartão ou localização precisa.',
      ],
    },
    {
      h: '3. Para que usamos',
      p: [
        'Prestar o serviço: criar sua conta, sincronizar listas entre os membros da família, guardar histórico de compras e preços e gerar relatórios (base legal: execução de contrato, art. 7º, V).',
        'Segurança e prevenção de abuso, e cumprimento de obrigações legais (art. 7º, II e IX).',
        'Melhorar o app a partir do seu feedback e de estatísticas de uso agregadas (legítimo interesse, art. 7º, IX).',
        'Enviar avisos que você solicitar, como "tem compra para fazer" (consentimento, art. 7º, I, que você pode revogar nas configurações do aparelho).',
        'Não vendemos seus dados e não os usamos para publicidade de terceiros.',
      ],
    },
    {
      h: '4. Com quem compartilhamos',
      p: [
        'Membros da sua família no Onlist: veem seu nome, e-mail, foto e o que você registra nas listas compartilhadas.',
        'Google LLC (Firebase): autenticação, banco de dados e envio de notificações.',
        'Vercel Inc.: hospedagem do aplicativo.',
        'Esses fornecedores processam dados em servidores fora do Brasil, principalmente nos Estados Unidos. A transferência internacional ocorre com base no art. 33 da LGPD, com fornecedores que adotam cláusulas contratuais e padrões de segurança reconhecidos.',
        'Autoridades públicas, somente quando houver obrigação legal ou ordem judicial.',
      ],
    },
    {
      h: '5. Por quanto tempo guardamos',
      p: [
        'Enquanto sua conta estiver ativa. Ao excluir a conta pelo app, seus dados pessoais são apagados. Se você for o dono da família e estiver sozinho nela, todas as listas, catálogo e histórico da família também são apagados.',
        'Compras e itens que você registrou em uma família com outros membros permanecem para eles, pois fazem parte do histórico do grupo, mas deixam de estar vinculados ao seu perfil.',
        'Mensagens de feedback podem ser mantidas por até 2 anos para melhoria do serviço; você pode pedir a exclusão pelo e-mail de contato.',
        'Dados podem ser mantidos por mais tempo quando exigido por lei.',
      ],
    },
    {
      h: '6. Seus direitos',
      p: [
        'Você pode, a qualquer momento: confirmar se tratamos seus dados, acessá-los, corrigi-los, pedir a portabilidade, a anonimização ou a exclusão, revogar consentimentos e obter informações sobre compartilhamento (art. 18 da LGPD).',
        'No próprio app você pode exportar seu histórico de compras (Registros → Exportar) e excluir sua conta (Conta → Excluir minha conta).',
        `Para os demais pedidos, escreva para ${c.email}. Respondemos em até 15 dias. Você também pode reclamar à Autoridade Nacional de Proteção de Dados (ANPD).`,
      ],
    },
    {
      h: '7. Segurança',
      p: [
        'Usamos conexão criptografada (HTTPS), autenticação pelo Google e regras de acesso no banco de dados que permitem que cada família veja somente os próprios dados.',
        'Nenhum sistema é totalmente imune a falhas. Se ocorrer um incidente que possa trazer risco relevante, avisaremos os titulares afetados e a ANPD.',
      ],
    },
    {
      h: '8. Crianças e adolescentes',
      p: ['O Onlist é destinado a maiores de 18 anos. Menores só podem participar de uma família com autorização e sob responsabilidade dos pais ou responsáveis.'],
    },
    {
      h: '9. Alterações',
      p: ['Podemos atualizar esta política. Mudanças relevantes serão avisadas no app e poderão exigir novo aceite.'],
    },
  ],
}

export const TERMS = {
  title: 'Termos de Uso',
  sections: [
    {
      h: '1. Aceite',
      p: [
        `Estes Termos regulam o uso do Onlist, operado por ${c.name}, CNPJ ${c.cnpj}. Ao usar o app você declara ter lido e aceito estes Termos e a Política de Privacidade.`,
      ],
    },
    {
      h: '2. O serviço',
      p: [
        'O Onlist é um aplicativo de lista de compras compartilhada, com histórico de compras, catálogo de preços e relatórios.',
        'Os preços e relatórios são registrados pelos próprios usuários e servem apenas como referência pessoal. Não garantimos que reflitam os preços praticados pelos estabelecimentos.',
        'O serviço pode passar por manutenções, mudanças ou interrupções. Procuramos avisar com antecedência quando possível.',
      ],
    },
    {
      h: '3. Conta e família',
      p: [
        'O acesso é feito com uma conta Google. Você é responsável pela segurança dessa conta.',
        'Quem cria a família é o dono e pode convidar pessoas pelo código, nomear administradores e remover membros. Os membros veem e editam as listas, o catálogo e o histórico da família.',
        'Compartilhe o código de convite apenas com quem deve ter acesso. Se ele vazar, gere um novo código em Conta.',
      ],
    },
    {
      h: '4. Planos e pagamento',
      p: [
        'O Onlist pode oferecer período de teste gratuito e planos pagos, com limite de pessoas por família. Preços, limites e formas de pagamento serão informados no app antes da contratação.',
        'Assinaturas poderão ser canceladas a qualquer momento pelo app. Para contratações online, você pode desistir em até 7 dias da contratação, com reembolso integral (art. 49 do Código de Defesa do Consumidor).',
      ],
    },
    {
      h: '5. Uso adequado',
      p: [
        'Você concorda em não usar o app para fins ilegais, não tentar acessar dados de outras famílias, não sobrecarregar ou interferir no funcionamento do serviço e não cadastrar conteúdo ofensivo.',
        'Podemos suspender contas que violem estes Termos, após aviso quando possível.',
      ],
    },
    {
      h: '6. Seus dados e conteúdo',
      p: [
        'O conteúdo que você cadastra é seu. Você nos autoriza a armazená-lo e processá-lo apenas para prestar o serviço, conforme a Política de Privacidade.',
        'Você pode exportar seu histórico e excluir sua conta a qualquer momento pelo app.',
      ],
    },
    {
      h: '7. Responsabilidade',
      p: [
        'O app é oferecido "como está". Não nos responsabilizamos por decisões de compra tomadas com base nos dados registrados, nem por perdas causadas por uso indevido da conta pelo próprio usuário ou por membros que ele convidou.',
        'Nada nestes Termos limita direitos garantidos pelo Código de Defesa do Consumidor.',
      ],
    },
    {
      h: '8. Alterações e contato',
      p: [
        `Podemos atualizar estes Termos. Mudanças relevantes serão avisadas no app. Dúvidas: ${c.email}.`,
      ],
    },
    {
      h: '9. Lei e foro',
      p: [
        `Aplica-se a legislação brasileira. Fica eleito o foro da comarca de ${c.city}, ressalvado ao consumidor o direito de propor ação no foro do seu domicílio.`,
      ],
    },
  ],
}
