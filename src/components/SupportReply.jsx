// Resposta do suporte: aparece uma vez, até a pessoa tocar em OK
export default function SupportReply({ data, onClose }) {
  return (
    <div className="fixed inset-0 z-[60] bg-black/60 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-sm bg-gray-900 border border-green-500/40 rounded-3xl p-5" onClick={e => e.stopPropagation()} role="dialog" aria-label="Resposta do suporte">
        <p className="text-2xl mb-2">✅</p>
        <h2 className="text-white text-lg font-semibold">Sua solicitação foi atendida</h2>
        {data.question && <p className="text-gray-500 text-xs mt-2 line-clamp-2">Você escreveu: "{data.question}"</p>}
        {data.reply && <p className="text-gray-200 text-sm mt-3 whitespace-pre-wrap bg-gray-800/60 rounded-xl px-3 py-2.5">{data.reply}</p>}
        <button onClick={onClose} className="w-full bg-green-500 text-white font-semibold py-3 rounded-xl mt-4">OK</button>
      </div>
    </div>
  )
}
