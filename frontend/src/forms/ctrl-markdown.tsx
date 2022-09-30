import Showdown from "showdown"

type Props = {
    markdown: string
}

const converter = new Showdown.Converter()

export const CtrlMarkdown = ({ markdown }: Props) => {
    const translation = converter.makeHtml(markdown).trim().replace(/^<p>(.*?)<\/p>$/i, "$1")


    return (<span dangerouslySetInnerHTML={{ __html: translation }} />)
}