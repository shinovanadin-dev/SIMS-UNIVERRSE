import ast
import re
import unittest
from pathlib import Path

TREE = ast.parse(Path('server.py').read_text(encoding='utf-8'))
NODES = [n for n in TREE.body if (isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id == 'TOKEN_PATTERN' for t in n.targets)) or (isinstance(n, ast.FunctionDef) and n.name in {'_tokens', '_safe_translation', '_linebreak_signature'}) or (isinstance(n, ast.ImportFrom) and n.module == 'collections')]
NS = {'re': re}
exec(compile(ast.Module(body=NODES, type_ignores=[]), 'server.py', 'exec'), NS)

class TokenTests(unittest.TestCase):
    safe = staticmethod(NS['_safe_translation'])

    def test_placeholders_markup_preserved(self):
        src = '<b>Hi</b> {0} %s [NAME] §'
        dst = '<b>Привет</b> {0} %s [NAME] §'
        self.assertEqual(self.safe(src, dst), dst)

    def test_missing_placeholder_falls_back(self):
        self.assertEqual(self.safe('Hi {0}', 'Привет'), 'Hi {0}')

    def test_extra_placeholder_falls_back(self):
        self.assertEqual(self.safe('Hi', 'Привет {0}'), 'Hi')

    def test_markup_change_falls_back(self):
        self.assertEqual(self.safe('<b>Hi</b>', 'Привет'), '<b>Hi</b>')

    def test_placeholders_may_reorder(self):
        src = '{0} %s [SIM_NAME]'
        dst = '[SIM_NAME] %s {0}'
        self.assertEqual(self.safe(src, dst), dst)

    def test_duplicate_token_count_is_preserved(self):
        src = '{0} then {0}'
        dst = '{0} потом'
        self.assertEqual(self.safe(src, dst), src)

    def test_printf_width_and_position_tokens(self):
        src = 'Value: %2$s, score %04d'
        dst = 'Счёт %04d: %2$s'
        self.assertEqual(self.safe(src, dst), dst)

    def test_escaped_control_tokens_preserved(self):
        src = 'Line one\\nLine two\\t{0}'
        dst = 'Строка один\\nСтрока два\\t{0}'
        self.assertEqual(self.safe(src, dst), dst)

    def test_missing_escaped_control_token_falls_back(self):
        src = 'A\\nB\\tC'
        dst = 'А\\nБ C'
        self.assertEqual(self.safe(src, dst), src)

    def test_newline_count_preserved(self):
        src = 'Line one\\nLine two'
        dst = 'Строка один\\nСтрока два'
        self.assertEqual(self.safe(src, dst), dst)

    def test_actual_linebreaks_preserved(self):
        src = 'First line\\nSecond line'
        dst = 'Первая строка\\nВторая строка'
        self.assertEqual(self.safe(src, dst), dst)

    def test_changed_actual_linebreak_count_falls_back(self):
        src = 'First\\nSecond\\nThird'
        dst = 'Первое\\nВторое'
        self.assertEqual(self.safe(src, dst), src)

    def test_translation_can_be_identical(self):
        src = 'Gameplay setting'
        self.assertEqual(self.safe(src, src), src)

if __name__ == '__main__':
    unittest.main()
