import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ProcessSettings } from '@/services/api';

const SUPPORTED_LANGUAGES = [
  { name: 'Afrikaans', code: 'afrikaans' },
  { name: 'Amharic', code: 'amharic' },
  { name: 'Arabic', code: 'arabic' },
  { name: 'Assamese', code: 'assamese' },
  { name: 'Azerbaijani', code: 'azerbaijani' },
  { name: 'Azerbaijani Cyrillic', code: 'azerbaijani_cyrilic' },
  { name: 'Belarusian', code: 'belarusian' },
  { name: 'Bengali', code: 'bengali' },
  { name: 'Tibetan', code: 'tibetan' },
  { name: 'Bosnian', code: 'bosnian' },
  { name: 'Breton', code: 'breton' },
  { name: 'Bulgarian', code: 'bulgarian' },
  { name: 'Catalan', code: 'catalan' },
  { name: 'Cebuano', code: 'cebuano' },
  { name: 'Czech', code: 'czech' },
  { name: 'Chinese Simplified', code: 'chinese_simplified' },
  { name: 'Chinese', code: 'chinese' },
  { name: 'Chinese Traditional', code: 'chinese_traditional' },
  { name: 'Cherokee', code: 'cherokee' },
  { name: 'Corsican', code: 'corsican' },
  { name: 'Welsh', code: 'welsh' },
  { name: 'Danish', code: 'danish' },
  { name: 'Danish Fraktur', code: 'danish_fraktur' },
  { name: 'German', code: 'german' },
  { name: 'German Fraktur', code: 'german_fraktur' },
  { name: 'Dzongkha', code: 'dzongkha' },
  { name: 'Greek', code: 'greek' },
  { name: 'English', code: 'english' },
  { name: 'Esperanto', code: 'esperanto' },
  { name: 'Estonian', code: 'estonian' },
  { name: 'Basque', code: 'basque' },
  { name: 'Persian', code: 'persian' },
  { name: 'Filipino', code: 'filipino' },
  { name: 'Finnish', code: 'finnish' },
  { name: 'French', code: 'french' },
  { name: 'Western Frisian', code: 'western_frisian' },
  { name: 'Scottish Gaelic', code: 'scottish_gaelic' },
  { name: 'Irish', code: 'irish' },
  { name: 'Galician', code: 'galician' },
  { name: 'Gujarati', code: 'gujarati' },
  { name: 'Haitian', code: 'haitian' },
  { name: 'Hebrew', code: 'hebrew' },
  { name: 'Hindi', code: 'hindi' },
  { name: 'Croatian', code: 'croatian' },
  { name: 'Hungarian', code: 'hungarian' },
  { name: 'Armenian', code: 'armenian' },
  { name: 'Indonesian', code: 'indonesian' },
  { name: 'Icelandic', code: 'icelandic' },
  { name: 'Italian', code: 'italian' },
  { name: 'Javanese', code: 'javanese' },
  { name: 'Japanese', code: 'japanese' },
  { name: 'Kannada', code: 'kannada' },
  { name: 'Georgian', code: 'georgian' },
  { name: 'Kazakh', code: 'kazakh' },
  { name: 'Khmer', code: 'khmer' },
  { name: 'Korean', code: 'korean' },
  { name: 'Lao', code: 'lao' },
  { name: 'Latin', code: 'latin' },
  { name: 'Latvian', code: 'latvian' },
  { name: 'Lithuanian', code: 'lithuanian' },
  { name: 'Malayalam', code: 'malayalam' },
  { name: 'Marathi', code: 'marathi' },
  { name: 'Macedonian', code: 'macedonian' },
  { name: 'Maltese', code: 'maltese' },
  { name: 'Mongolian', code: 'mongolian' },
  { name: 'Malay', code: 'malay' },
  { name: 'Burmese', code: 'burmese' },
  { name: 'Nepali', code: 'nepali' },
  { name: 'Dutch', code: 'dutch' },
  { name: 'Norwegian', code: 'norwegian' },
  { name: 'Polish', code: 'polish' },
  { name: 'Portuguese', code: 'portuguese' },
  { name: 'Pashto', code: 'pashto' },
  { name: 'Romanian', code: 'romanian' },
  { name: 'Russian', code: 'russian' },
  { name: 'Sanskrit', code: 'sanskrit' },
  { name: 'Sinhala', code: 'sinhala' },
  { name: 'Slovak', code: 'slovak' },
  { name: 'Slovenian', code: 'slovenian' },
  { name: 'Spanish', code: 'spanish' },
  { name: 'Albanian', code: 'albanian' },
  { name: 'Serbian', code: 'serbian' },
  { name: 'Swedish', code: 'swedish' },
  { name: 'Tamil', code: 'tamil' },
  { name: 'Telugu', code: 'telugu' },
  { name: 'Thai', code: 'thai' },
  { name: 'Turkish', code: 'turkish' },
  { name: 'Ukrainian', code: 'ukrainian' },
  { name: 'Urdu', code: 'urdu' },
  { name: 'Uzbek', code: 'uzbek' },
  { name: 'Vietnamese', code: 'vietnamese' },
  { name: 'Yiddish', code: 'yiddish' },
];

interface UploadSettingsProps {
  settings: ProcessSettings;
  onSettingsChange: (settings: ProcessSettings) => void;
}

export const UploadSettings = ({ settings, onSettingsChange }: UploadSettingsProps) => {
  const updateSetting = (key: keyof ProcessSettings, value: any) => {
    onSettingsChange({ ...settings, [key]: value });
  };

  return (
    <div className="glass-card p-6 space-y-6">
      <h3 className="text-lg font-semibold">Processing Settings</h3>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="languages">Language</Label>
          <Select
            value={settings.languages}
            onValueChange={(value) => {
              updateSetting('languages', value);
            }}
          >
            <SelectTrigger id="languages">
              <SelectValue placeholder="Select a language" />
            </SelectTrigger>
            <SelectContent className="max-h-[300px]">
              {SUPPORTED_LANGUAGES.map((lang) => (
                <SelectItem key={lang.code} value={lang.code}>
                  {lang.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground mt-1">
            Selected: <span className="font-medium">{settings.languages || 'None'}</span>
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <Checkbox
            id="extractImages"
            checked={settings.extractImages}
            onCheckedChange={(checked) => updateSetting('extractImages', checked)}
          />
          <Label htmlFor="extractImages" className="cursor-pointer">
            Extract Images
          </Label>
        </div>

        <div className="flex items-center space-x-2">
          <Checkbox
            id="extractTables"
            checked={settings.extractTables}
            onCheckedChange={(checked) => updateSetting('extractTables', checked)}
          />
          <Label htmlFor="extractTables" className="cursor-pointer">
            Extract Tables
          </Label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="maxCharacters">Max Characters</Label>
            <Input
              id="maxCharacters"
              type="number"
              value={settings.maxCharacters}
              onChange={(e) => updateSetting('maxCharacters', parseInt(e.target.value))}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="newAfterNChars">New After N Chars</Label>
            <Input
              id="newAfterNChars"
              type="number"
              value={settings.newAfterNChars}
              onChange={(e) => updateSetting('newAfterNChars', parseInt(e.target.value))}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="combineTextUnderNChars">Combine Text Under N Chars</Label>
            <Input
              id="combineTextUnderNChars"
              type="number"
              value={settings.combineTextUnderNChars}
              onChange={(e) => updateSetting('combineTextUnderNChars', parseInt(e.target.value))}
            />
          </div>
        </div>
      </div>
    </div>
  );
};