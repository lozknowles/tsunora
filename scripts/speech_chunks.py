"""Sentence boundaries for optional original-voice synthesis; no text rewriting."""
import re

def sentence_parts(text):
    parts=[]
    for part in re.split(r'(?<=[.!?])\s+', text.strip()):
        if parts and re.search(r'\b(?:Mr|Mrs|Ms|Dr|Prof|St)\.$', parts[-1]):
            parts[-1]+=' '+part
        else:
            parts.append(part)
    return parts
