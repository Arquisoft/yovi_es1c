import { useId, useState } from 'react';
import {
    Box,
    Dialog,
    DialogContent,
    DialogTitle,
    IconButton,
    List,
    ListItem,
    Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { useTranslation } from 'react-i18next';

export type HelpButtonProps = {
    titleKey: string;
    contentKeys: string[];
    buttonSx?: Record<string, unknown>;
};

export default function HelpButton({ titleKey, contentKeys, buttonSx }: Readonly<HelpButtonProps>) {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const titleId = useId();

    return (
        <>
            <Box
                component="button"
                type="button"
                aria-label={t('help.open')}
                onClick={() => setOpen(true)}
                sx={{
                    position: 'absolute',
                    top: 16,
                    right: 16,
                    width: 40,
                    height: 40,
                    borderRadius: '50%',
                    border: '1px solid',
                    borderColor: 'primary.main',
                    color: 'primary.main',
                    backgroundColor: 'rgba(0,0,0,0.45)',
                    fontWeight: 700,
                    fontSize: '1.1rem',
                    cursor: 'pointer',
                    '&:hover': {
                        backgroundColor: 'rgba(57, 255, 20, 0.14)',
                    },
                    ...buttonSx,
                }}
            >
                ?
            </Box>

            <Dialog
                open={open}
                onClose={() => setOpen(false)}
                aria-labelledby={titleId}
                role="dialog"
                aria-modal="true"
                fullWidth
                maxWidth="sm"
            >
                <DialogTitle id={titleId} sx={{ pr: 6 }}>
                    {t(titleKey)}
                    <IconButton
                        aria-label={t('help.close')}
                        onClick={() => setOpen(false)}
                        sx={{ position: 'absolute', right: 8, top: 8 }}
                    >
                        <CloseIcon />
                    </IconButton>
                </DialogTitle>
                <DialogContent>
                    <List sx={{ listStyleType: 'disc', pl: 2 }}>
                        {contentKeys.map((itemKey) => (
                            <ListItem key={itemKey} sx={{ display: 'list-item', py: 0.5 }}>
                                <Typography variant="body2">{t(itemKey)}</Typography>
                            </ListItem>
                        ))}
                    </List>
                </DialogContent>
            </Dialog>
        </>
    );
}