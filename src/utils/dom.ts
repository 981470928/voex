export function useFileUpload() {
  function selectFiles(): Promise<FileList | null> {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = true;
      input.style.display = 'none';
      document.body.appendChild(input);

      input.addEventListener('change', () => {
        resolve(input.files);
        document.body.removeChild(input);
      });
      input.click();
    });
  }

  return { selectFiles };
}
