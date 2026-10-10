// The light/dark switch of every page (vbarbarosh/rules UI-01 to UI-05).
// Loaded in <head> before the page paints: it stamps data-theme on <html>
// at once, so a page never flashes the other theme. The page's own CSS
// redefines its tokens under :root[data-theme="dark"]. The button sits in
// the top right corner of the window, so it stays in reach on a long page;
// a page that draws its own button in its bar marks <html data-theme-switch="inline">.

// Sun and crescent from the Docusaurus theme switch, as vbarbarosh/rules
// ships them in img/theme-sun.svg and img/theme-moon.svg (MIT, Facebook).
const THEME_SUN_PATH = 'M12,9c1.65,0,3,1.35,3,3s-1.35,3-3,3s-3-1.35-3-3S10.35,9,12,9 M12,7c-2.76,0-5,2.24-5,5s2.24,5,5,5s5-2.24,5-5 S14.76,7,12,7L12,7z M2,13l2,0c0.55,0,1-0.45,1-1s-0.45-1-1-1l-2,0c-0.55,0-1,0.45-1,1S1.45,13,2,13z M20,13l2,0c0.55,0,1-0.45,1-1 s-0.45-1-1-1l-2,0c-0.55,0-1,0.45-1,1S19.45,13,20,13z M11,2v2c0,0.55,0.45,1,1,1s1-0.45,1-1V2c0-0.55-0.45-1-1-1S11,1.45,11,2z M11,20v2c0,0.55,0.45,1,1,1s1-0.45,1-1v-2c0-0.55-0.45-1-1-1C11.45,19,11,19.45,11,20z M5.99,4.58c-0.39-0.39-1.03-0.39-1.41,0 c-0.39,0.39-0.39,1.03,0,1.41l1.06,1.06c0.39,0.39,1.03,0.39,1.41,0s0.39-1.03,0-1.41L5.99,4.58z M18.36,16.95 c-0.39-0.39-1.03-0.39-1.41,0c-0.39,0.39-0.39,1.03,0,1.41l1.06,1.06c0.39,0.39,1.03,0.39,1.41,0c0.39-0.39,0.39-1.03,0-1.41 L18.36,16.95z M19.42,5.99c0.39-0.39,0.39-1.03,0-1.41c-0.39-0.39-1.03-0.39-1.41,0l-1.06,1.06c-0.39,0.39-0.39,1.03,0,1.41 s1.03,0.39,1.41,0L19.42,5.99z M7.05,18.36c0.39-0.39,0.39-1.03,0-1.41c-0.39-0.39-1.03-0.39-1.41,0l-1.06,1.06 c-0.39,0.39-0.39,1.03,0,1.41s1.03,0.39,1.41,0L7.05,18.36z';
const THEME_MOON_PATH = 'M9.37,5.51C9.19,6.15,9.1,6.82,9.1,7.5c0,4.08,3.32,7.4,7.4,7.4c0.68,0,1.35-0.09,1.99-0.27C17.45,17.19,14.93,19,12,19 c-3.86,0-7-3.14-7-7C5,9.07,6.81,6.55,9.37,5.51z M12,3c-4.97,0-9,4.03-9,9s4.03,9,9,9s9-4.03,9-9c0-0.46-0.04-0.92-0.1-1.36 c-0.98,1.37-2.58,2.26-4.4,2.26c-2.98,0-5.4-2.42-5.4-5.4c0-1.81,0.89-3.42,2.26-4.4C12.92,3.04,12.46,3,12,3L12,3z';
const THEME_STORAGE_KEY = 'theme';

theme_apply(theme_read());
theme_style_mount();

if (document.documentElement.dataset.themeSwitch !== 'inline') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', theme_switch_mount);
    }
    else {
        theme_switch_mount();
    }
}

function theme_read()
{
    try {
        const theme = localStorage.getItem(THEME_STORAGE_KEY);
        if ((theme === 'light') || (theme === 'dark')) {
            return theme;
        }
    }
    catch (error) {
        console.warn(error);
    }
    return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function theme_write(theme)
{
    theme_apply(theme);
    try {
        localStorage.setItem(THEME_STORAGE_KEY, theme);
    }
    catch (error) {
        console.warn(error);
    }
}

function theme_apply(theme)
{
    document.documentElement.dataset.theme = theme;
    for (const button of document.querySelectorAll('.theme-switch-fixed')) {
        theme_switch_refresh(button);
    }
    document.dispatchEvent(new CustomEvent('theme-change', {detail: theme}));
}

function theme_style_mount()
{
    const style = document.createElement('style');
    style.textContent = `
        .theme-switch-fixed {
            position: fixed;
            top: 10px;
            right: 10px;
            z-index: 600;
        }

        .theme-switch {
            display: flex;
            flex: none;
            align-items: center;
            justify-content: center;
            width: 34px;
            height: 34px;
            padding: 0;
            border: 0;
            border-radius: 8px;
            background: transparent;
            color: #27336a;
            cursor: pointer;
            transition: background-color 0.15s;
        }

        .theme-switch:hover {
            background: #27336a1a;
        }

        .theme-switch:focus-visible {
            outline: 2px solid #91a6e6;
            outline-offset: 2px;
        }

        :root[data-theme="dark"] .theme-switch {
            color: #e4e6ee;
        }

        :root[data-theme="dark"] .theme-switch:hover {
            background: #e4e6ee1f;
        }

        @media print {
            .theme-switch {
                display: none;
            }
        }
    `;
    document.head.append(style);
}

function theme_switch_mount()
{
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'theme-switch theme-switch-fixed';
    button.addEventListener('click', click_theme_switch);
    theme_switch_refresh(button);
    document.body.append(button);
}

function theme_switch_refresh(button)
{
    const dark = (document.documentElement.dataset.theme === 'dark');
    const label = theme_switch_label(dark ? 'dark' : 'light');
    button.setAttribute('aria-label', label);
    button.title = label;
    button.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path fill="currentColor" d="${dark ? THEME_MOON_PATH : THEME_SUN_PATH}"/></svg>`;
}

function theme_switch_label(theme)
{
    return (theme === 'dark') ? 'Dark theme. Switch to light theme.' : 'Light theme. Switch to dark theme.';
}

function click_theme_switch()
{
    theme_write((document.documentElement.dataset.theme === 'dark') ? 'light' : 'dark');
}
