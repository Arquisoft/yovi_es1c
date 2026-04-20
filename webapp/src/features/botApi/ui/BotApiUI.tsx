import {useTranslation} from "react-i18next";

export default function BotApiUI() {
    const { t } = useTranslation();
    return <div>{t('botAPI')}</div>;
}