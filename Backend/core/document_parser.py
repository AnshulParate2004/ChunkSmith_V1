"""Document parsing module using unstructured library"""
import os
from pathlib import Path
from typing import List
from unstructured.partition.pdf import partition_pdf


# Supported OCR languages mapping
SUPPORTED_LANGUAGES = {
    "afrikaans": "afr", "amharic": "amh", "arabic": "ara", "assamese": "asm",
    "azerbaijani": "aze", "azerbaijani_cyrilic": "aze_cyrl", "belarusian": "bel",
    "bengali": "ben", "tibetan": "bod", "bosnian": "bos", "breton": "bre",
    "bulgarian": "bul", "catalan": "cat", "cebuano": "ceb", "czech": "ces",
    "chinese_simplified": "chi_sim", "chinese": "chi_sim", "chinese_traditional": "chi_tra",
    "cherokee": "chr", "corsican": "cos", "welsh": "cym", "danish": "dan",
    "danish_fraktur": "dan_frak", "german": "deu", "german_fraktur": "deu_frak",
    "dzongkha": "dzo", "greek": "ell", "english": "eng", "esperanto": "epo",
    "estonian": "est", "basque": "eus", "persian": "fas", "filipino": "fil",
    "finnish": "fin", "french": "fra", "german_fraktur": "frk", "western_frisian": "fry",
    "scottish_gaelic": "gla", "irish": "gle", "galician": "glg", "gujarati": "guj",
    "haitian": "hat", "hebrew": "heb", "hindi": "hin", "croatian": "hrv",
    "hungarian": "hun", "armenian": "hye", "indonesian": "ind", "icelandic": "isl",
    "italian": "ita", "javanese": "jav", "japanese": "jpn", "kannada": "kan",
    "georgian": "kat", "kazakh": "kaz", "khmer": "khm", "korean": "kor",
    "lao": "lao", "latin": "lat", "latvian": "lav", "lithuanian": "lit",
    "malayalam": "mal", "marathi": "mar", "macedonian": "mkd", "maltese": "mlt",
    "mongolian": "mon", "malay": "msa", "burmese": "mya", "nepali": "nep",
    "dutch": "nld", "norwegian": "nor", "polish": "pol", "portuguese": "por",
    "pashto": "pus", "romanian": "ron", "russian": "rus", "sanskrit": "san",
    "sinhala": "sin", "slovak": "slk", "slovenian": "slv", "spanish": "spa",
    "albanian": "sqi", "serbian": "srp", "swedish": "swe", "tamil": "tam",
    "telugu": "tel", "thai": "tha", "turkish": "tur", "ukrainian": "ukr",
    "urdu": "urd", "uzbek": "uzb", "vietnamese": "vie", "yiddish": "yid"
}


class DocumentParser:
    """Handles PDF document parsing and chunking"""
    
    def __init__(self, image_output_dir: str):
        self.image_output_dir = image_output_dir
        Path(image_output_dir).mkdir(parents=True, exist_ok=True)
    
    @staticmethod
    def get_supported_languages() -> dict:
        """Return dictionary of supported languages"""
        return SUPPORTED_LANGUAGES.copy()
    
    @staticmethod
    def get_language_codes(language_names: List[str]) -> List[str]:
        """
        Convert language names to OCR codes
        
        Args:
            language_names: List of language names (e.g., ['english', 'hindi'])
            
        Returns:
            List of language codes (e.g., ['eng', 'hin'])
        """
        codes = []
        for lang in language_names:
            lang_lower = lang.lower()
            if lang_lower in SUPPORTED_LANGUAGES:
                codes.append(SUPPORTED_LANGUAGES[lang_lower])
            else:
                # If already a code, use it directly
                if lang in SUPPORTED_LANGUAGES.values():
                    codes.append(lang)
                else:
                    print(f"Warning: Unknown language '{lang}', skipping")
        
        # Default to English if no valid languages
        if not codes:
            print("No valid languages found, defaulting to English")
            codes = ['eng']
        
        return codes
    
    def partition_pdf_document(
        self,
        file_path: str,
        max_characters: int,
        new_after_n_chars: int,
        combine_text_under_n_chars: int,
        extract_images: bool = True,
        extract_tables: bool = True,
        languages: List[str] = ['english']
    ):
        """
        Extract elements from PDF using unstructured library.
        
        Args:
            file_path: Path to the PDF file
            max_characters: Maximum characters per chunk
            new_after_n_chars: Start new chunk after this many characters
            combine_text_under_n_chars: Combine small text blocks
            extract_images: Whether to extract images
            extract_tables: Whether to infer table structure
            languages: List of language names or codes (e.g., ['english', 'hindi'] or ['eng', 'hin'])
        
        Returns:
            List of extracted elements
        """
        # Validate file
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"PDF file not found: {file_path}")
        
        # Validate chunk parameters
        if max_characters >= new_after_n_chars:
            raise ValueError("max_characters must be less than new_after_n_chars")
        
        # Convert language names to codes
        language_codes = self.get_language_codes(languages)
        
        print(f"Partitioning document: {file_path}")
        print(f"Settings: Images={extract_images}, Tables={extract_tables}, Languages={language_codes}")
        print(f"Chunk settings: max={max_characters}, new_after={new_after_n_chars}, combine={combine_text_under_n_chars}")

        elements = partition_pdf(
            filename=file_path,
            strategy="hi_res",
            hi_res_model_name="yolox",
            chunking_strategy="by_title",
            include_orig_elements=True,
            split_pdf_page=True,
            split_pdf_concurrency_level=15,
            languages=language_codes,
            extract_images_in_pdf=extract_images,
            extract_image_block_to_payload=extract_images,
            extract_image_block_output_dir=self.image_output_dir if extract_images else None,
            extract_image_block_types=["Image"] if extract_images else [],
            infer_table_structure=extract_tables,
            max_characters=max_characters,
            new_after_n_chars=new_after_n_chars,
            combine_text_under_n_chars=combine_text_under_n_chars,
        )
        
        print(f"Extracted {len(elements)} elements")
        
        # Print element breakdown
        element_types = {}
        for elem in elements:
            elem_type = type(elem).__name__
            element_types[elem_type] = element_types.get(elem_type, 0) + 1
        print(f"Element breakdown: {dict(element_types)}")
        
        return elements
    
    