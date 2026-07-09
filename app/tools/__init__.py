async def run_tool(message: str) -> str:
    text = message.strip()
    if not text:
        return "Send a message and I will route it to a tool."

    return f"Received: {text}"
