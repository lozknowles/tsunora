import unittest
from speech_chunks import sentence_parts

class SentenceChunks(unittest.TestCase):
    def test_preserves_critical_numbers_and_negation(self):
        text='Three jobs are running. Publication is not approved. No job has been cancelled.'
        self.assertEqual(sentence_parts(text),['Three jobs are running.','Publication is not approved.','No job has been cancelled.'])
        self.assertEqual(' '.join(sentence_parts(text)),text)
    def test_preserves_versions_abbreviations_and_single_sentences(self):
        text='Dr. POE checked version 4.1.0. Is it ready? Yes!'
        self.assertEqual(sentence_parts(text),['Dr. POE checked version 4.1.0.','Is it ready?','Yes!'])
        self.assertEqual(sentence_parts('No work is running.'),['No work is running.'])

if __name__=='__main__':unittest.main()
