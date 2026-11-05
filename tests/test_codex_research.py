from __future__ import annotations

import json
import asyncio
import unittest
from unittest.mock import patch

from backend.app import codex_research


class CodexResearchTests(unittest.TestCase):
    def test_diagnostics_never_include_raw_prompt_or_cli_content(self) -> None:
        metadata = codex_research._diagnostic_metadata(
            b'{"type":"turn.started","secret":"PRIVATE_PROMPT"}\n{"type":"PRIVATE_TOKEN"}',
            b'network connection failed SECRET_TOKEN',
        )
        self.assertEqual(metadata['events'], {'turn.started': 1})
        self.assertEqual(metadata['stderr_category'], 'connection')
        self.assertNotIn('PRIVATE', json.dumps(metadata))
        self.assertNotIn('SECRET', json.dumps(metadata))

    def test_timeout_kills_process_and_logs_safe_request_reference(self) -> None:
        async def scenario():
            killed = asyncio.Event()

            class Process:
                returncode = None

                async def communicate(self, _input):
                    await killed.wait()
                    return b'{"type":"turn.started"}', b'network SECRET_TOKEN'

                def kill(self):
                    self.returncode = -1
                    killed.set()

                async def wait(self):
                    return self.returncode

            async def spawn(*_args, **_kwargs):
                return Process()

            with patch.object(codex_research.asyncio, 'create_subprocess_exec', side_effect=spawn), patch.object(codex_research, '_research_command', return_value=['mock-cli']), patch.object(codex_research, 'RESEARCH_TIMEOUT_SECONDS', 0.01):
                with self.assertLogs('uvicorn.error', level='INFO') as captured:
                    with self.assertRaisesRegex(TimeoutError, r'Mã kiểm tra: [a-f0-9]{12}'):
                        await codex_research._run_research('PRIVATE_PROMPT', 'mock-model')
                output = '\n'.join(captured.output)
                self.assertIn('deadline_exceeded', output)
                self.assertIn('turn.started', output)
                self.assertNotIn('PRIVATE_PROMPT', output)
                self.assertNotIn('SECRET_TOKEN', output)

        loop = asyncio.SelectorEventLoop()
        try:
            loop.run_until_complete(scenario())
        finally:
            loop.close()

    def test_parses_model_catalog_and_prefers_a_light_test_model(self) -> None:
        models = codex_research._parse_model_rows([
            {"id": "gpt-codex-pro", "displayName": "Codex Pro", "isDefault": True},
            {"id": "gpt-codex-mini", "displayName": "Codex Mini"},
            None,
            {"displayName": "Missing identifier"},
        ])
        self.assertEqual([row["slug"] for row in models], ["gpt-codex-pro", "gpt-codex-mini"])
        self.assertTrue(models[1]["recommended_for_testing"])
        self.assertEqual(codex_research._recommended_model(models)["slug"], "gpt-codex-mini")

    def test_recommends_an_available_light_model_when_slug_has_no_cost_hint(self) -> None:
        models = codex_research._parse_model_rows([
            {"id": "gpt-6.1-sol", "displayName": "Sol", "isDefault": True},
            {"id": "gpt-6-luna", "displayName": "Luna", "description": "Fast and affordable model"},
        ])
        self.assertEqual(codex_research._recommended_model(models)["slug"], "gpt-6-luna")

    def test_parses_only_final_assistant_message_from_cli_jsonl(self) -> None:
        output = "\n".join([
            json.dumps({"type": "item.completed", "item": {"type": "agent_message", "text": "Partial answer"}}),
            json.dumps({"type": "item.completed", "item": {"type": "agent_message", "text": "Final answer with source https://example.com"}}),
            "not-json",
        ])
        self.assertEqual(codex_research._message_from_exec_output(output), "Final answer with source https://example.com")

    def test_research_command_uses_read_only_ephemeral_cli_without_local_shell(self) -> None:
        with patch.object(codex_research, "_cli_command", side_effect=lambda args: ["codex", *args]):
            command = codex_research._research_command("gpt-codex-mini", "C:/temp/pohub-codex")
        self.assertIn("--sandbox", command)
        self.assertIn("read-only", command)
        self.assertIn("--ephemeral", command)
        self.assertIn("--disable", command)
        self.assertIn("shell_tool", command)
        self.assertNotIn("--search", command)
        self.assertIn("--model", command)
        self.assertIn("gpt-codex-mini", command)
        self.assertIn("model_reasoning_effort=low", command)
        self.assertIn("C:/temp/pohub-codex", command)

    def test_source_only_product_analysis_prompt_disables_web_research(self) -> None:
        prompt = codex_research._safe_research_prompt("Analyze only [C1].", allow_web_search=False)
        self.assertIn("Do not search the web or use sources outside", prompt)
        self.assertIn("Analyze only [C1].", prompt)
        self.assertIn("Do not use shell commands", prompt)

    def test_regular_research_prompt_keeps_existing_public_research_behavior(self) -> None:
        prompt = codex_research._safe_research_prompt("Research the market.", allow_web_search=True)
        self.assertIn("Search current public sources if web search is available", prompt)


if __name__ == "__main__":
    unittest.main()
