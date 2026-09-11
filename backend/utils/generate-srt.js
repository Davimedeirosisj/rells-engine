import fs from 'node:fs';
import path from 'node:path';

/**
 * Gera o arquivo .srt a partir dos cortes do vídeo
 * 
 * @param {Array} cuts - Array de cortes com campos: start, duration, transcript
 * @param {string} outputPath - Caminho para salvar o SRT
 */
export function generateSRT(cuts, outputPath) {
  let srtContent = '';
  
  cuts.forEach((cut, index) => {
    const { start, duration, transcript } = cut;
    
    // Formata timestamp no padrão SRT (00:00:00,000)
    const formatTimestamp = (timeMs) => {
      const totalSeconds = Math.floor(timeMs / 1000);
      const milliseconds = (timeMs % 1000).toString().padStart(3, '0');
      
      const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
      const minutes = String((totalSeconds % 3600) / 60).padStart(2, '0');
      const seconds = String(totalSeconds % 60).padStart(2, '0');
      
      return `${hours}:${minutes}:${seconds},${milliseconds}`;
    };
    
    const startTime = formatTimestamp(start);
    const endTime = formatTimestamp(start + duration);
    
    // Adiciona índice do subtítulo
    srtContent += `${index + 1}\n`;
    
    // Adiciona intervalo de tempo
    srtContent += `${startTime} --> ${endTime}\n`;
    
    // Adiciona texto (quebra linha no meio da frase para melhor legibilidade)
    const words = transcript.split(' ');
    let currentLine = '';
    
    for (const word of words) {
      if (currentLine.length + word.length + 1 <= 40) {
        // Mantém até 40 caracteres por linha
        currentLine += word + ' ';
      } else {
        if (currentLine.trim()) srtContent += currentLine.trim() + '\n';
        currentLine = word + ' ';
      }
    }
    
    if (currentLine.trim()) {
      srtContent += currentLine.trim();
    }
    
    srtContent += '\n\n'; // Espaço entre subtítulos
  });
  
  // Escreve o arquivo SRT
  fs.writeFileSync(outputPath, srtContent);
  
  console.log(`[INFO] Gerado: ${outputPath}`);
  console.log(`[INFO] Total de legendas: ${cuts.length}`);
}

export default generateSRT;
