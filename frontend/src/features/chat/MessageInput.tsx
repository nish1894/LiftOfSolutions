import { useState } from "react";

interface MessageInputProps {
  onSend: (text: string) => void;
  disabled?: boolean;
}

export default function MessageInput({ onSend, disabled }: MessageInputProps) {
  const [value, setValue] = useState("");

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const message = value.trim();
    if (!message || disabled) return;

    setValue("");
    onSend(message);
  }

  return (
    <form onSubmit={handleSubmit}>
      <input
        id="message"
        name="message"
        autoComplete="off"
        placeholder="Message"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        disabled={disabled}
      />
      <button type="submit" disabled={disabled || !value.trim()}>
        Send
      </button>
    </form>
  );
}
