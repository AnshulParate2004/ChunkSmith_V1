# """Document parsing module using Unstructured API"""
import os
from pathlib import Path
from typing import List
from unstructured_client import UnstructuredClient
from unstructured_client.models import operations, shared
from unstructured.staging.base import elements_from_dicts


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
    """Handles PDF document parsing and chunking using Unstructured API"""
    
    def __init__(self, image_output_dir: str, api_key: str = None):
        self.image_output_dir = image_output_dir
        Path(image_output_dir).mkdir(parents=True, exist_ok=True)
        
        # Load API key from environment if not provided
        self.api_key = api_key or os.getenv("UNSTRUCTURED_API_KEY")
        if not self.api_key:
            raise ValueError("UNSTRUCTURED_API_KEY not found in environment")
    
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
                    # print(f"Warning: Unknown language '{lang}', skipping")
        
        # Default to English if no valid languages
        if not codes:
            # print("No valid languages found, defaulting to English")
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
        languages: List[str] = ['english'],
        split_pdf_concurrency_level: int = 1
    ):
        """
        Extract elements from PDF using Unstructured API.
        
        Args:
            file_path: Path to the PDF file
            max_characters: Maximum characters per chunk
            new_after_n_chars: Start new chunk after this many characters
            combine_text_under_n_chars: Combine small text blocks
            extract_images: Whether to extract images
            extract_tables: Whether to infer table structure
            languages: List of language names or codes (e.g., ['english', 'hindi'] or ['eng', 'hin'])
            split_pdf_concurrency_level: Concurrency level for PDF page splitting
        
        Returns:
            List of extracted elements
        """
        # Validate file
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"PDF file not found: {file_path}")
        
        # print(f"Partitioning document: {file_path}")
        # print(f"File size: {os.path.getsize(file_path):,} bytes")
        # print(f"Settings: split_pdf_concurrency_level={split_pdf_concurrency_level}")
        
        # Initialize Unstructured API client
        client = UnstructuredClient(api_key_auth=self.api_key)
        
        # Read PDF file
        with open(file_path, "rb") as f:
            files = shared.Files(
                content=f.read(),
                file_name=os.path.basename(file_path),
            )
        
        # Create partition request
        request = operations.PartitionRequest(
            
            partition_parameters=shared.PartitionParameters(
                files=files,
                num_processes=10,
                partition_by_api=False,
                split_pdf_page=True,
                split_pdf_allow_failed=True,
                split_pdf_concurrency_level=split_pdf_concurrency_level,
                extract_image_block_types=["Image", "Table"],
            )
        )
        
        # print("Partitioning PDF with Unstructured API...")
        result = client.general.partition(request=request)
        elements = elements_from_dicts(result.elements)
        
        # print(f"✓ Partitioning complete: {len(elements)} elements")
        
        # Print element breakdown
        element_types = {}
        for elem in elements:
            elem_type = type(elem).__name__
            element_types[elem_type] = element_types.get(elem_type, 0) + 1
        # print(f"Element breakdown: {dict(element_types)}")
        
        return elements
    
    