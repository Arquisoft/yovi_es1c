import { useMemo, useState } from 'react';
import { Button, Menu, MenuItem, ListItemText } from '@mui/material';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import { useTranslation } from 'react-i18next';

const LANGUAGE_OPTIONS = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'it', label: 'Italiano' },
  { code: 'fr', label: 'Français' },
  { code: 'zh', label: '中文' },
] as const;

export default function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  const currentCode = (i18n.resolvedLanguage || i18n.language || 'en').split('-')[0];

  const currentLanguage = useMemo(
    () => LANGUAGE_OPTIONS.find((item) => item.code === currentCode) ?? LANGUAGE_OPTIONS[0],
    [currentCode],
  );

  const open = Boolean(anchorEl);

  return (
    <>
      <Button
        color="inherit"
        onClick={(event) => setAnchorEl(event.currentTarget)}
        endIcon={<KeyboardArrowDownIcon />}
      >
        {currentLanguage.code.toUpperCase()}
      </Button>

      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={() => setAnchorEl(null)}
      >
        {LANGUAGE_OPTIONS
          .filter((item) => item.code !== currentLanguage.code)
          .map((item) => (
            <MenuItem
              key={item.code}
              onClick={() => {
                void i18n.changeLanguage(item.code);
                setAnchorEl(null);
              }}
            >
              <ListItemText>
                {item.code.toUpperCase()}
              </ListItemText>
            </MenuItem>
          ))}
      </Menu>
    </>
  );
}