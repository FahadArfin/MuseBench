import {MediaGenerationPanel,type MediaGenerationPanelProps} from '../image/ImageGenerationPanel';
import {WorkComingSoon} from '../WorkComingSoon';
export function VoiceoverPanel(_props:MediaGenerationPanelProps){return <WorkComingSoon title="Narration" features={['Generate voiceover']}/>;}
export function TranscriptionPanel(props:MediaGenerationPanelProps){return <MediaGenerationPanel {...props} action="audio.transcribe" title="Transcribe with Muse"/>;}
export default VoiceoverPanel;
