import { useEffect } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';

export default function ScannerQrCedula({ onRutDetectado, onCerrar }) {
  useEffect(() => {
    const scanner = new Html5QrcodeScanner(
      'lector-qr-cedula-sj',
      { fps: 10, qrbox: { width: 240, height: 240 } },
      false
    );

    scanner.render(
      (decodedText) => {
        // Extrae el RUN desde el QR oficial de la cédula chilena (Registro Civil)
        const match = decodedText.match(/RUN=([0-9kK.-]+)/i);
        const run = match && match[1] ? match[1].toUpperCase() : decodedText.trim().toUpperCase();
        onRutDetectado(run);
        scanner.clear().catch(() => {});
      },
      () => {}
    );

    return () => {
      scanner.clear().catch(() => {});
    };
  }, [onRutDetectado]);

  return (
    <div className="p-4 bg-slate-900 text-white rounded-xl space-y-3">
      <div className="flex justify-between items-center">
        <span className="text-sm font-semibold">Apunte la cámara al código QR de la Cédula de Identidad</span>
        <button type="button" onClick={onCerrar} className="text-xs bg-red-600 px-2.5 py-1 rounded">
          Cerrar cámara
        </button>
      </div>
      <div id="lector-qr-cedula-sj" className="bg-white text-slate-900 rounded overflow-hidden" />
    </div>
  );
}
