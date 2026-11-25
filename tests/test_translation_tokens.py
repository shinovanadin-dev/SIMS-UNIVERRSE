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
        src = 'Value: %2$s, score %1$04d'
        dst = 'Счёт %1$04d: %2$s'
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


    def test_tag_attributes_are_preserved_exactly(self):
        src = '<link="0x123">Open</link>'
        dst = '<link="0x123">Открыть</link>'
        self.assertEqual(self.safe(src, dst), dst)

    def test_tag_attribute_change_falls_back(self):
        src = '<link="0x123">Open</link>'
        dst = '<link="0x999">Открыть</link>'
        self.assertEqual(self.safe(src, dst), src)

    def test_multiple_printf_tokens_reordered(self):
        src = '%1$s: %2$d (%3$s)'
        dst = '%3$s (%2$d): %1$s'
        self.assertEqual(self.safe(src, dst), dst)

    def test_token_multiplicity_must_match(self):
        src = '{0} {0} {1}'
        dst = '{1} {0}'
        self.assertEqual(self.safe(src, dst), src)

    def test_crlf_line_endings_must_match(self):
        src = 'One\\r\\nTwo'
        dst = 'Один\\nДва'
        self.assertEqual(self.safe(src, dst), src)

    def test_unicode_text_without_tokens_translates(self):
        src = 'Hello, world! 日本語 café'
        dst = 'Привет! 日本語 café'
        self.assertEqual(self.safe(src, dst), dst)

    def test_localized_gender_conditional_suffixes_allowed(self):
        src = "{M0.He} {F0.She} {0M.His} {0F.Her}"
        dst = "{M0.Он} {F0.Она} {0M.Его} {0F.Её}"
        self.assertEqual(self.safe(src, dst), dst)

    def test_gender_family_loss_rejected(self):
        src = "{M0.He} {F0.She}"
        dst = "{M0.Он}"
        self.assertEqual(self.safe(src, dst), src)

    def test_product_plural_suffix_localized(self):
        src = "{S0.item} {P0.items}"
        dst = "{S0.предмет} {P0.предметов}"
        self.assertEqual(self.safe(src, dst), dst)

    def test_conditional_family_duplication_rejected(self):
        src = "{M0.He}"
        dst = "{M0.Он} {M0.Он}"
        self.assertEqual(self.safe(src, dst), src)

    def test_localized_gender_conditional_suffixes_allowed(self):
        src = "{M0.He} {F0.She} {0M.His} {0F.Her}"
        dst = "{M0.Он} {F0.Она} {0M.Его} {0F.Её}"
        self.assertEqual(self.safe(src, dst), dst)

    def test_gender_family_loss_rejected(self):
        src = "{M0.He} {F0.She}"
        dst = "{M0.Он}"
        self.assertEqual(self.safe(src, dst), src)

    def test_product_plural_suffix_localized(self):
        src = "{S0.item} {P0.items}"
        dst = "{S0.предмет} {P0.предметов}"
        self.assertEqual(self.safe(src, dst), dst)

    def test_conditional_family_duplication_rejected(self):
        src = "{M0.He}"
        dst = "{M0.Он} {M0.Он}"
        self.assertEqual(self.safe(src, dst), src)

if __name__ == '__main__':
    unittest.main()
