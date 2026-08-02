import { useState } from "react";

export default function MessageInput({ onSend, disabled }) {
  const [value, setValue] = useState("");

  function handleSubmit(event) {
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
