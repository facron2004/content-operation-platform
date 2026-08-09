export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (
      typeof navigator !== 'undefined' &&
      typeof window !== 'undefined' &&
      navigator.clipboard &&
      window.isSecureContext
    ) {
      await navigator.clipboard.writeText(text);
      return true;
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    Object.assign(textarea.style, { position: 'fixed', left: '-9999px', top: '-9999px' });
    let appended = false;
    let copied = false;
    try {
      document.body.appendChild(textarea);
      appended = true;
      textarea.focus();
      textarea.select();
      copied = document.execCommand('copy');
    } finally {
      if (appended) document.body.removeChild(textarea);
    }
    return copied;
  } catch {
    return false;
  }
}
